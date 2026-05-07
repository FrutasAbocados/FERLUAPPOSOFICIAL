// Edge Function: borrar-borrador-holded
// ----------------------------------------------------------------------------
// Elimina un borrador en Holded y limpia los campos holded_* del pedido WA.
// Solo para borradores: si Holded rechaza el DELETE (porque ya está emitido),
// devolvemos el error sin tocar la BD.
//
// Body: { pedido_id: uuid }
// Auth: admin_full | admin_op | responsable
// ----------------------------------------------------------------------------

const HOLDED_BASE = 'https://api.holded.com/api/invoicing/v1/documents'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HOLDED_KEY   = Deno.env.get('HOLDED_API_KEY') || ''

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

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) throw new Error('jwt sin payload')
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - b64.length % 4) % 4
  return JSON.parse(atob(b64 + '='.repeat(pad)))
}

async function checkAuth(req: Request): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, msg: 'falta Authorization' }
  let payload: Record<string, unknown>
  try { payload = decodeJwtPayload(token) }
  catch { return { ok: false, status: 401, msg: 'jwt inválido' } }
  const role = String(payload.role ?? '')
  if (role === 'service_role') return { ok: true }
  if (role !== 'authenticated') return { ok: false, status: 403, msg: `rol JWT no permitido: ${role || '—'}` }
  const sub = String(payload.sub ?? '')
  if (!sub) return { ok: false, status: 403, msg: 'jwt sin sub' }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sub}&select=role`, { headers: dbHeaders })
  if (!res.ok) return { ok: false, status: 500, msg: `profiles ${res.status}` }
  const rows = await res.json() as Array<{ role?: string }>
  const userRole = rows[0]?.role ?? ''
  if (userRole !== 'admin_full' && userRole !== 'admin_op' && userRole !== 'responsable') {
    return { ok: false, status: 403, msg: 'sin permiso' }
  }
  return { ok: true }
}

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { ...cors, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = await checkAuth(req)
  if (!auth.ok) return jsonRes({ error: auth.msg }, auth.status)
  if (!HOLDED_KEY) return jsonRes({ error: 'HOLDED_API_KEY no configurada' }, 500)

  let body: { pedido_id?: string } = {}
  try { body = await req.json() } catch { /* */ }
  if (!body.pedido_id) return jsonRes({ error: 'falta pedido_id' }, 400)

  const pedRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos_wa?id=eq.${body.pedido_id}&select=id,holded_invoice_id,holded_invoice_doc_type`,
    { headers: dbHeaders },
  )
  if (!pedRes.ok) return jsonRes({ error: `cargar pedido ${pedRes.status}` }, 500)
  const rows = await pedRes.json() as Array<{ id: string; holded_invoice_id: string | null; holded_invoice_doc_type: string | null }>
  if (rows.length === 0) return jsonRes({ error: 'pedido no encontrado' }, 404)
  const pedido = rows[0]
  if (!pedido.holded_invoice_id || !pedido.holded_invoice_doc_type) {
    return jsonRes({ error: 'pedido sin doc Holded asociado' }, 422)
  }

  const docType = pedido.holded_invoice_doc_type
  const endpoint = `${HOLDED_BASE}/${docType}/${pedido.holded_invoice_id}`

  let delRes: Response
  try {
    delRes = await fetch(endpoint, {
      method: 'DELETE',
      headers: { key: HOLDED_KEY, accept: 'application/json' },
    })
  } catch (e) {
    return jsonRes({ error: 'fetch DELETE Holded falló', detail: e instanceof Error ? e.message : String(e) }, 502)
  }

  const txt = await delRes.text()
  if (!delRes.ok) {
    return jsonRes({
      error: `Holded ${delRes.status} al borrar`,
      detail: txt.slice(0, 500),
      hint: delRes.status === 400 || delRes.status === 422
        ? 'el documento puede estar ya emitido — bórralo manualmente en Holded si quieres rehacerlo'
        : undefined,
    }, 502)
  }

  // DELETE OK → limpiar BD para que el pedido vuelva a ser confirmable
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos_wa?id=eq.${body.pedido_id}`,
    {
      method: 'PATCH',
      headers: { ...dbHeaders, prefer: 'return=minimal' },
      body: JSON.stringify({
        holded_invoice_id: null,
        holded_invoice_num: null,
        holded_invoice_doc_type: null,
        holded_invoice_created_at: null,
        estado: 'pendiente',
      }),
    },
  )
  if (!patchRes.ok) {
    return jsonRes({
      ok: false,
      warning: 'borrado en Holded OK pero limpieza BD falló',
      bd_error: (await patchRes.text()).slice(0, 400),
    }, 207)
  }

  return jsonRes({ ok: true, deleted_holded_id: pedido.holded_invoice_id, doc_type: docType })
})
