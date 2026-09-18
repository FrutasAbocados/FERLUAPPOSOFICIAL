// Edge Function: informe-margen-diario
// ----------------------------------------------------------------------------
// Genera el PDF diario de margen (factura a factura del día + acumulado del mes
// por cliente), lo sube al bucket privado `informes-margen` y envía por
// WhatsApp (CallMeBot) un resumen con enlace firmado al PDF.
//
// Disparable por:
//   - Cron pg_cron 22:00 Europe/Madrid (Authorization: Bearer service_role).
//   - Manual desde admin (Authorization: Bearer JWT con role admin_full/admin_op).
//
// Body opcional: { fecha?: 'YYYY-MM-DD', trigger?: string, send?: boolean, force?: boolean }
// El cron no reenvía si ya hay un envío OK para la fecha (salvo force).
// El WhatsApp lleva un enlace corto a `informe-margen-pdf?t=<token>`, que firma
// el PDF al vuelo; el token caduca a los 7 días.
// ----------------------------------------------------------------------------

import { buildPdf, eur, type Informe, MARGEN_BAJO_PCT, pct, pctTxt } from './pdf.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'informes-margen'
const LINK_TTL_SECONDS = 7 * 24 * 3600

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { ...cors, 'content-type': 'application/json' } })
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) throw new Error('jwt sin payload')
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - b64.length % 4) % 4
  return JSON.parse(atob(b64 + '='.repeat(pad)))
}

async function checkAuth(req: Request): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, msg: 'falta Authorization' }
  let payload: Record<string, unknown>
  try { payload = decodeJwtPayload(token) } catch { return { ok: false, status: 401, msg: 'jwt inválido' } }
  const role = String(payload.role ?? '')
  if (role === 'service_role') return { ok: true }
  if (role !== 'authenticated') return { ok: false, status: 403, msg: `rol JWT: ${role}` }
  const sub = String(payload.sub ?? '')
  if (!sub) return { ok: false, status: 403, msg: 'jwt sin sub' }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sub}&select=role`, { headers: dbHeaders })
  if (!res.ok) return { ok: false, status: 500, msg: `profiles ${res.status}` }
  const rows = await res.json() as Array<{ role?: string }>
  if (!['admin_full', 'admin_op'].includes(rows[0]?.role ?? '')) return { ok: false, status: 403, msg: 'solo admin' }
  return { ok: true }
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: dbHeaders, body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`rpc ${name} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return await res.json() as T
}

async function logEnvio(row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/informe_margen_envios`, {
    method: 'POST', headers: { ...dbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(row),
  })
  if (!res.ok) console.error(`informe-margen: log ${res.status}`)
}

async function yaEnviado(fecha: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/informe_margen_envios?fecha=eq.${fecha}&estado=eq.ok&select=id&limit=1`,
    { headers: dbHeaders },
  )
  if (!res.ok) return false
  return ((await res.json()) as unknown[]).length > 0
}

function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
}

// ---------------------------------------------------------------------------
// Storage + WhatsApp
// ---------------------------------------------------------------------------

async function subirPdf(path: string, bytes: Uint8Array): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/pdf', 'x-upsert': 'true' },
    body: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
  })
  if (!res.ok) throw new Error(`storage upload ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

async function firmarUrl(path: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST', headers: dbHeaders, body: JSON.stringify({ expiresIn: LINK_TTL_SECONDS }),
  })
  if (!res.ok) throw new Error(`storage sign ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const { signedURL } = await res.json() as { signedURL: string }
  return `${SUPABASE_URL}/storage/v1${signedURL}`
}

function tokenAleatorio(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => abc[b % abc.length]).join('')
}

async function enlaceCorto(path: string): Promise<string> {
  const token = tokenAleatorio()
  const res = await fetch(`${SUPABASE_URL}/rest/v1/informe_margen_links`, {
    method: 'POST',
    headers: { ...dbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ token, storage_path: path, expira_at: new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString() }),
  })
  if (!res.ok) throw new Error(`link ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return `${SUPABASE_URL}/functions/v1/informe-margen-pdf?t=${token}`
}

async function enviarWhatsApp(text: string): Promise<string> {
  const cfg = await rpc<{ phone: string | null; apikey: string | null }>('informe_margen_callmebot_config', {})
  if (!cfg.phone || !cfg.apikey) throw new Error('callmebot no configurado en Vault')
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(cfg.phone)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(cfg.apikey)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  const body = (await res.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  // CallMeBot responde 200 aunque rechace: el veredicto va en el cuerpo.
  if (!res.ok || /not sent|not delivered|invalid|error|denied|exceeded|quota/i.test(body)) {
    throw new Error(`callmebot ${res.status}: ${body.slice(-160)}`)
  }
  return body.slice(-300)
}

function mensaje(inf: Informe, link: string): string {
  const pDia = pct(inf.dia.margen, inf.dia.base_coste)
  const pMes = pct(inf.mes_total.margen, inf.mes_total.base_coste)
  const bajos = inf.facturas.filter((f) => {
    const p = pct(f.margen, f.base_coste)
    return p !== null && p < MARGEN_BAJO_PCT
  }).length
  return [
    `Informe margen ${inf.fecha}`,
    `Hoy: ${eur(inf.dia.ventas)} · margen ${eur(inf.dia.margen)} (${pctTxt(pDia)}) · ${inf.dia.documentos} docs`,
    `Mes: ${eur(inf.mes_total.ventas)} · margen ${eur(inf.mes_total.margen)} (${pctTxt(pMes)})`,
    bajos ? `${bajos} docs por debajo del ${MARGEN_BAJO_PCT}%` : '',
    inf.dia.lineas_pendientes ? `${inf.dia.lineas_pendientes} lineas sin coste` : '',
    `PDF: ${link}`,
  ].filter(Boolean).join('\n')
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonRes({ error: 'solo POST' }, 405)

  const auth = await checkAuth(req)
  if (!auth.ok) return jsonRes({ error: auth.msg }, auth.status)

  const body = await req.json().catch(() => ({})) as { fecha?: string; trigger?: string; send?: boolean; force?: boolean }
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha ?? '') ? body.fecha! : hoyMadrid()
  const trigger = String(body.trigger ?? 'manual').slice(0, 40)
  const send = body.send !== false

  if (send && trigger === 'cron' && !body.force && await yaEnviado(fecha)) {
    return jsonRes({ ok: true, skipped: 'ya enviado', fecha })
  }

  let storagePath: string | null = null
  try {
    const inf = await rpc<Informe>('informe_margen_diario', { p_fecha: fecha })
    if (!inf.facturas.length) {
      if (send) await logEnvio({ fecha, trigger, estado: 'sin_ventas' })
      return jsonRes({ ok: true, fecha, sin_ventas: true })
    }
    const pdf = await buildPdf(inf)
    storagePath = `${fecha.slice(0, 7)}/margen-${fecha}.pdf`
    await subirPdf(storagePath, pdf)
    const link = send ? await enlaceCorto(storagePath) : await firmarUrl(storagePath)
    let respuesta: string | null = null
    if (send) respuesta = await enviarWhatsApp(mensaje(inf, link))
    if (send) await logEnvio({ fecha, trigger, estado: 'ok', storage_path: storagePath, respuesta_proveedor: respuesta })
    return jsonRes({ ok: true, fecha, enviado: send, documentos: inf.dia.documentos, storage_path: storagePath, link, respuesta })
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500)
    await logEnvio({ fecha, trigger, estado: 'error', storage_path: storagePath, error: msg })
    return jsonRes({ ok: false, fecha, error: msg }, 500)
  }
})
