// Edge Function: manager-asesor-ia
// ----------------------------------------------------------------------------
// Asesor comercial IA: analiza las facturas de VENTA de un día, cliente por
// cliente, y propone mejoras de COSTE y PVP usando el histórico de cada cliente
// y el mercado (resto de clientes). Devuelve JSON estructurado de acciones.
//
// Body: { fecha?: 'YYYY-MM-DD', force?: boolean }
// Devuelve: { ok, fecha, resumen, oportunidad_eur, clientes, modelo, cacheado }
// Auth: admin_full / admin_op (o service_role).
// ----------------------------------------------------------------------------

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const MODEL         = Deno.env.get('ASESOR_MODEL') || 'claude-haiku-4-5-20251001'
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_TIMEOUT_MS = 140_000

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey',
}

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } })
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) throw new Error('jwt sin payload')
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (b64.length % 4)) % 4
  return JSON.parse(atob(b64 + '='.repeat(pad)))
}

async function checkAuth(req: Request): Promise<{ ok: true; userId?: string } | { ok: false; status: number; msg: string }> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
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
  const rows = (await res.json()) as Array<{ role?: string }>
  const userRole = rows[0]?.role ?? ''
  if (!['admin_full', 'admin_op'].includes(userRole)) return { ok: false, status: 403, msg: 'solo admin' }
  return { ok: true, userId: sub }
}

function fechaHoyMadrid(): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return f.format(new Date()) // YYYY-MM-DD
}

interface Linea {
  producto: string; uds: number; venta: number; pvp_dia: number; coste: number | null
  margen_pct: number | null; pvp_cliente_90d: number | null
  pvp_mercado_med: number | null; pvp_mercado_p75: number | null; clientes_mercado: number | null
}
interface ClientePayload { cliente: string; venta: number; lineas: Linea[] }
interface Payload { fecha: string; total_venta: number; n_clientes: number; clientes: ClientePayload[] }

const SYSTEM = `Eres un asesor comercial experto de un mayorista de frutas y verduras (Frutas Abocados, Málaga). Analizas las ventas de UN día, cliente por cliente, para maximizar margen sin perder al cliente.

Para cada línea tienes: pvp_dia (precio cobrado hoy), coste (coste real unitario; null = coste sin definir), margen_pct, pvp_cliente_90d (lo que ESE cliente suele pagar), pvp_mercado_med y pvp_mercado_p75 (lo que pagan el resto de clientes), clientes_mercado (cuántos clientes forman ese mercado).

Detecta y prioriza:
1. VENTA A PÉRDIDA o margen < 18% → severidad alta.
2. PVP por debajo de lo que ESE cliente ya pagaba (pvp_dia < pvp_cliente_90d) → probable error de tarifa; recuperar.
3. PVP por debajo del mercado (pvp_dia < pvp_mercado_med, mejor aún si < p75) con margen mejorable → subida sugerida. Sé prudente: propón acercar a la mediana o como mucho al p75, nunca por encima.
4. coste = null → margen es falso (aparenta 100%); acción tipo "coste": pedir fijar el coste real.
5. Si todo está bien en un cliente, NO lo incluyas.

Reglas:
- impacto_eur de una acción PVP = (pvp_objetivo - pvp_dia) * uds, redondeado.
- Ignora diferencias < 0,05 €/ud o impacto < 1 €.
- Fíjate en que clientes_mercado bajo (1-2) hace el "mercado" poco fiable: no agresivo ahí.
- detalle: una frase concreta y accionable en español, con cifras. Ej: "Le cobras 1,85 €/kg, su media es 2,28 y el mercado 2,49 → sube a 2,30 (+6,6 €)".
- Devuelve SOLO JSON válido, sin texto alrededor, sin markdown.

Formato exacto:
{
  "resumen": "2-3 frases del día: dónde están las mayores fugas de margen",
  "oportunidad_eur": <suma de impacto_eur de acciones tipo pvp>,
  "clientes": [
    {
      "cliente": "NOMBRE",
      "venta": <num>,
      "nota": "1 frase resumen del cliente",
      "acciones": [
        { "tipo": "pvp"|"coste"|"alerta", "producto": "...", "severidad": "alta"|"media"|"baja", "detalle": "...", "impacto_eur": <num> }
      ]
    }
  ]
}`

async function callClaude(payload: Payload): Promise<{ obj: AsesorResult; tokensIn: number; tokensOut: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `Datos del día ${payload.fecha} (${payload.n_clientes} clientes, ${payload.total_venta} € en ventas):\n\n${JSON.stringify(payload.clientes)}\n\nDevuelve el JSON con las oportunidades.`,
        }],
      }),
    })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`anthropic ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json() as {
    content?: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const text = (data.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('')
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  let obj: AsesorResult
  try {
    obj = JSON.parse(cleaned)
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('respuesta IA no es JSON')
    obj = JSON.parse(m[0])
  }
  return { obj, tokensIn: data.usage?.input_tokens ?? 0, tokensOut: data.usage?.output_tokens ?? 0 }
}

interface Accion { tipo: string; producto: string; severidad: string; detalle: string; impacto_eur: number }
interface ClienteRes { cliente: string; venta: number; nota: string; acciones: Accion[] }
interface AsesorResult { resumen: string; oportunidad_eur: number; clientes: ClienteRes[] }

function construirMd(r: AsesorResult, fecha: string): string {
  const lines: string[] = []
  lines.push(`**Asesor IA · ${fecha}** — oportunidad estimada **${Math.round(r.oportunidad_eur || 0)} €**`)
  lines.push('')
  lines.push(r.resumen ?? '')
  for (const c of r.clientes ?? []) {
    lines.push('')
    lines.push(`### ${c.cliente}`)
    if (c.nota) lines.push(`_${c.nota}_`)
    for (const a of c.acciones ?? []) {
      const tag = a.tipo === 'coste' ? '💲' : a.tipo === 'alerta' ? '⚠️' : '📈'
      const imp = a.impacto_eur ? ` (+${Math.round(a.impacto_eur)} €)` : ''
      lines.push(`- ${tag} **${a.producto}** — ${a.detalle}${imp}`)
    }
  }
  return lines.join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = await checkAuth(req)
    if (!auth.ok) return json({ error: auth.msg }, auth.status)
    if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500)

    const body = await req.json().catch(() => ({})) as { fecha?: string; force?: boolean }
    const fecha = (body.fecha && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) ? body.fecha : fechaHoyMadrid()

    // Cache: si ya existe para ese día y no se fuerza, devolver
    if (!body.force) {
      const cRes = await fetch(`${SUPABASE_URL}/rest/v1/manager_asesor_ia?fecha=eq.${fecha}&select=*`, { headers: dbHeaders })
      if (cRes.ok) {
        const rows = await cRes.json() as Array<{ datos: AsesorResult; resumen: string; oportunidad_eur: number; modelo: string }>
        if (rows[0]?.datos) {
          const r = rows[0].datos
          return json({ ok: true, fecha, cacheado: true, resumen: r.resumen, oportunidad_eur: r.oportunidad_eur, clientes: r.clientes, modelo: rows[0].modelo })
        }
      }
    }

    // Payload de datos
    const pRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/manager_asesor_ia_payload`, {
      method: 'POST', headers: dbHeaders, body: JSON.stringify({ p_fecha: fecha }),
    })
    if (!pRes.ok) return json({ error: `payload ${pRes.status}: ${(await pRes.text()).slice(0, 200)}` }, 500)
    const payload = await pRes.json() as Payload
    if (!payload || (payload.n_clientes ?? 0) === 0) {
      return json({ ok: true, fecha, vacio: true, resumen: 'No hay ventas registradas ese día.', oportunidad_eur: 0, clientes: [] })
    }

    const { obj, tokensIn, tokensOut } = await callClaude(payload)
    const contenido_md = construirMd(obj, fecha)

    // Guardar (upsert)
    await fetch(`${SUPABASE_URL}/rest/v1/manager_asesor_ia?on_conflict=fecha`, {
      method: 'POST',
      headers: { ...dbHeaders, prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        fecha,
        contenido_md,
        datos: obj,
        resumen: obj.resumen ?? null,
        oportunidad_eur: obj.oportunidad_eur ?? null,
        modelo: MODEL,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        created_by: auth.userId ?? null,
        created_at: new Date().toISOString(),
      }),
    })

    return json({ ok: true, fecha, cacheado: false, resumen: obj.resumen, oportunidad_eur: obj.oportunidad_eur, clientes: obj.clientes, modelo: MODEL, tokens_in: tokensIn, tokens_out: tokensOut })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
