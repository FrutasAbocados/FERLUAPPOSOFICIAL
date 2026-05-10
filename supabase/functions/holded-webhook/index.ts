// Edge Function: holded-webhook
// ----------------------------------------------------------------------------
// Recibe eventos de Holded (factura/albarán created, updated, approved, deleted)
// y sincroniza el estado en pedidos_wa.
//
// Auth (en orden de prioridad):
//   1. HMAC: si llega header `x-holded-signature` → validar HMAC SHA256(body)
//      con secret en app_settings.holded_webhook_hmac_secret.
//   2. Legacy: si NO llega `x-holded-signature` pero llega `x-webhook-secret`,
//      validar contra app_settings.holded_webhook_secret (fallback por si
//      Holded añadiese soporte de custom headers en el futuro).
//
// IMPORTANTE: deploy con verify_jwt=false porque Holded NO envía JWT.
//
// Configuración Holded actual (vía API, NO UI):
//   POST https://api.holded.com/api/webhooks/v1/create
//     header: key: <HOLDED_API_KEY>
//     body:   { url: "<SUPABASE_URL>/functions/v1/holded-webhook",
//               event: "invoice.created" }   (1 webhook por evento)
//
// El secret HMAC que usa Holded para firmar NO está documentado públicamente.
// Hipótesis a confirmar con un primer evento real:
//   H1: el HMAC se firma con el API key del usuario que registró el webhook.
//   H2: existe un secret separado devuelto por el endpoint create.
// Mientras se confirma, el edge loguea headers + body de los primeros eventos
// con prefix [HOLDED-WEBHOOK-DEBUG] — visible en Supabase Functions Logs.
// ----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-webhook-secret, x-holded-signature, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { ...cors, 'content-type': 'application/json' },
  })
}

async function getSetting(key: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/app_settings?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: dbHeaders },
  )
  if (!res.ok) return null
  const rows = await res.json() as Array<{ value: string }>
  return rows[0]?.value ?? null
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Mapeo flexible: Holded varía la estructura según versión/recurso. Probamos
// varios paths para extraer id, status, total.
function extractFields(body: unknown): {
  holded_id: string | null
  status: string | null
  total: number | null
  event: string | null
} {
  const b = body as Record<string, unknown>
  const data = (b?.data ?? b) as Record<string, unknown>
  const idCandidate = data?.id ?? b?.id ?? null
  const statusRaw = data?.status ?? b?.status ?? null
  const totalRaw = data?.total ?? b?.total ?? null
  const event = (b?.event ?? b?.type ?? null) as string | null

  let status: string | null = null
  if (typeof statusRaw === 'number') {
    status = statusRaw === 1 ? 'approved' : statusRaw === 0 ? 'draft' : String(statusRaw)
  } else if (typeof statusRaw === 'string') {
    status = statusRaw
  }

  return {
    holded_id: typeof idCandidate === 'string' ? idCandidate : null,
    status,
    total: typeof totalRaw === 'number' ? totalRaw : (totalRaw ? Number(totalRaw) : null),
    event,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonRes({ error: 'método no permitido' }, 405)

  // Leemos body como TEXT primero porque el HMAC se calcula sobre los bytes
  // exactos enviados por Holded — un re-stringify perdería el formato original.
  const rawBody = await req.text()
  const sigHeader = req.headers.get('x-holded-signature') ?? ''
  const customSecret = req.headers.get('x-webhook-secret') ?? ''

  // Debug logging — útil mientras se confirma qué secret usa Holded.
  // Una vez confirmado y estable, este log se puede quitar.
  const debugHeaders: Record<string, string> = {}
  for (const [k, v] of req.headers.entries()) {
    if (k.toLowerCase().startsWith('x-') || k.toLowerCase() === 'content-type') {
      debugHeaders[k] = v
    }
  }
  console.log('[HOLDED-WEBHOOK-DEBUG]', JSON.stringify({
    headers: debugHeaders,
    body_preview: rawBody.slice(0, 800),
    body_len: rawBody.length,
  }))

  // Path 1 (preferido): HMAC SHA256
  let authOK = false
  let authMethod: 'hmac' | 'legacy_custom_header' | 'none' = 'none'

  if (sigHeader) {
    const hmacSecret = await getSetting('holded_webhook_hmac_secret')
    if (!hmacSecret) {
      console.log('[HOLDED-WEBHOOK-DEBUG] sigHeader presente pero hmac_secret no configurado en app_settings')
      return jsonRes({ error: 'hmac secret no configurado en app_settings.holded_webhook_hmac_secret' }, 500)
    }
    const expectedSig = await hmacSha256Hex(hmacSecret, rawBody)
    // Holded podría enviar la firma como hex puro o con prefix tipo "sha256=...".
    const cleanSig = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader
    authOK = timingSafeEqual(cleanSig.toLowerCase(), expectedSig.toLowerCase())
    authMethod = 'hmac'
    if (!authOK) {
      console.log('[HOLDED-WEBHOOK-DEBUG] HMAC mismatch', { received: cleanSig.slice(0, 16) + '…', expected: expectedSig.slice(0, 16) + '…' })
    }
  } else if (customSecret) {
    // Path 2 (legacy): custom header. Solo aplica si Holded soporta enviar headers
    // custom — actualmente no parece soportarlo, pero dejamos el path por si acaso.
    const expected = await getSetting('holded_webhook_secret')
    if (!expected) return jsonRes({ error: 'webhook secret no configurado' }, 500)
    authOK = timingSafeEqual(customSecret, expected)
    authMethod = 'legacy_custom_header'
  } else {
    return jsonRes({ error: 'sin header de autenticación (esperado x-holded-signature o x-webhook-secret)' }, 401)
  }

  if (!authOK) return jsonRes({ error: 'auth inválida', method: authMethod }, 401)

  // Body parsing
  let body: unknown = null
  try { body = JSON.parse(rawBody) } catch {
    return jsonRes({ ok: true, ignored: 'body no es JSON', auth_method: authMethod })
  }

  const { holded_id, status, total, event } = extractFields(body)
  if (!holded_id) {
    return jsonRes({ ok: true, ignored: 'sin holded_id en body', event, auth_method: authMethod })
  }

  const patch: Record<string, unknown> = {
    holded_last_webhook_at: new Date().toISOString(),
  }
  if (status !== null) patch.holded_status = status
  if (total !== null && Number.isFinite(total)) patch.holded_total = total

  const updRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos_wa?holded_invoice_id=eq.${holded_id}`,
    {
      method: 'PATCH',
      headers: { ...dbHeaders, prefer: 'return=representation' },
      body: JSON.stringify(patch),
    },
  )
  const txt = await updRes.text()
  if (!updRes.ok) {
    return jsonRes({ ok: false, error: `update BD ${updRes.status}`, detail: txt.slice(0, 400), event, auth_method: authMethod }, 500)
  }

  let updated: unknown[] = []
  try { updated = JSON.parse(txt) } catch { /* */ }

  return jsonRes({
    ok: true,
    auth_method: authMethod,
    event,
    holded_id,
    status,
    total,
    matched_pedidos: Array.isArray(updated) ? updated.length : 0,
  })
})
