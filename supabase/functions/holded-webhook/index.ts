// Edge Function: holded-webhook
// ----------------------------------------------------------------------------
// Recibe eventos de Holded (factura/albarán created, updated, approved, deleted)
// y sincroniza el estado en pedidos_wa.
//
// Auth: header `x-webhook-secret` debe matchear app_settings.holded_webhook_secret.
// Configuración Holded:
//   1. Settings → Webhooks → Add
//   2. URL: <SUPABASE_URL>/functions/v1/holded-webhook
//   3. Eventos: invoice.* y waybill.*
//   4. Custom header: x-webhook-secret = <valor de app_settings>
//
// IMPORTANTE: deploy con verify_jwt=false porque Holded NO envía JWT.
// La auth se hace con el secret compartido.
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
  'Access-Control-Allow-Headers': 'authorization, x-webhook-secret, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { ...cors, 'content-type': 'application/json' },
  })
}

async function getSecret(): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/app_settings?key=eq.holded_webhook_secret&select=value`,
    { headers: dbHeaders },
  )
  if (!res.ok) return null
  const rows = await res.json() as Array<{ value: string }>
  return rows[0]?.value ?? null
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
    // Holded usa 0=draft, 1=approved en algunos endpoints
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

  const secretHeader = req.headers.get('x-webhook-secret') ?? ''
  const expected = await getSecret()
  if (!expected) return jsonRes({ error: 'webhook secret no configurado' }, 500)
  if (secretHeader !== expected) return jsonRes({ error: 'secret inválido' }, 401)

  let body: unknown = null
  try { body = await req.json() } catch { return jsonRes({ error: 'body no es JSON' }, 400) }

  const { holded_id, status, total, event } = extractFields(body)
  if (!holded_id) {
    // Loguear pero responder 200 para que Holded no reintente
    return jsonRes({ ok: true, ignored: 'sin holded_id en body', event })
  }

  const patch: Record<string, unknown> = {
    holded_last_webhook_at: new Date().toISOString(),
  }
  if (status !== null) patch.holded_status = status
  if (total !== null && Number.isFinite(total)) patch.holded_total = total

  // Buscar pedido por holded_invoice_id
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
    return jsonRes({ ok: false, error: `update BD ${updRes.status}`, detail: txt.slice(0, 400), event }, 500)
  }

  let updated: unknown[] = []
  try { updated = JSON.parse(txt) } catch { /* */ }

  return jsonRes({
    ok: true,
    event,
    holded_id,
    status,
    total,
    matched_pedidos: Array.isArray(updated) ? updated.length : 0,
  })
})
