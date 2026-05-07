// Edge Function: borrar-borrador-holded
// Elimina un borrador en Holded y limpia los campos holded_* del pedido WA.
// Body: { pedido_id: uuid }
// Auth: admin_full | admin_op | responsable

import {
  HOLDED_BASE, HOLDED_KEY, SUPABASE_URL,
  cors, dbHeaders,
  checkAuth, jsonRes,
} from '../_shared/holded.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = await checkAuth(req, { allowedRoles: ['admin_full', 'admin_op', 'responsable'] })
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
