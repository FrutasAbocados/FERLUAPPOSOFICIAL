// Edge Function: compra-a-holded
// Sube una factura de proveedor (pedidos_wa_compras) a Holded como
// documents/purchase. Idempotente — si la compra ya tiene holded_purchase_id,
// devuelve 409 sin tocar nada.
//
// Body: { compra_id: uuid, dry_run?: boolean }
// Auth: admin_full | admin_op

import {
  HOLDED_KEY, SUPABASE_URL,
  cors, dbHeaders,
  checkAuth, fechaToUnixMadrid, jsonRes,
} from '../_shared/holded.ts'

const HOLDED_PURCHASE_URL = 'https://api.holded.com/api/invoicing/v1/documents/purchase'

interface CompraRow {
  id: string
  proveedor_holded_id: string
  proveedor_nombre: string
  num_factura: string
  fecha: string
  total_bruto: number | string
  total_iva: number | string
  total: number | string
  pdf_filename: string | null
  notas: string | null
  holded_purchase_id: string | null
  holded_purchase_num: string | null
}

interface CompraLineaRow {
  orden: number
  codigo_proveedor: string | null
  descripcion: string
  cantidad: number | string
  unidad: string
  precio_unitario: number | string
  iva_pct: number | string
  importe: number | string
}

/**
 * Defensa: si una línea llega con precio_unitario 0 pero cantidad e importe
 * son coherentes, derivar precio = importe/cantidad antes de mandar a Holded.
 * Idempotente: si el precio en BD ya estaba bien, no se toca.
 */
function precioReparado(l: CompraLineaRow): number {
  const cantidad = Number(l.cantidad ?? 0)
  const importe  = Number(l.importe ?? 0)
  const precio   = Number(l.precio_unitario ?? 0)
  if (cantidad <= 0) return precio
  const cuadra = Math.abs(cantidad * precio - importe) <= 0.05
  if (cuadra && precio > 0) return precio
  if (importe > 0) return Number((importe / cantidad).toFixed(4))
  return precio
}

function buildHoldedBody(c: CompraRow, lineas: CompraLineaRow[]) {
  return {
    contactId:   c.proveedor_holded_id,
    contactName: c.proveedor_nombre,
    desc:        `Factura prov ${c.num_factura}`,
    date:        fechaToUnixMadrid(c.fecha),
    docNumber:   c.num_factura,
    notes:       [c.pdf_filename, c.notas].filter(Boolean).join(' · ') || undefined,
    language:    'es',
    currency:    'eur',
    items:       lineas.map(l => ({
      name:  l.descripcion,
      desc:  `${Number(l.cantidad)} ${l.unidad}`,
      units: Number(l.cantidad),
      price: precioReparado(l),
      tax:   Number(l.iva_pct),
      sku:   l.codigo_proveedor || undefined,
    })),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = await checkAuth(req, { allowedRoles: ['admin_full', 'admin_op'] })
  if (!auth.ok) return jsonRes({ error: auth.msg }, auth.status)
  if (!HOLDED_KEY) return jsonRes({ error: 'HOLDED_API_KEY no configurada' }, 500)

  let body: { compra_id?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  if (!body.compra_id) return jsonRes({ error: 'falta compra_id' }, 400)
  const dryRun = body.dry_run === true

  const cabRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos_wa_compras?id=eq.${body.compra_id}&select=*`,
    { headers: dbHeaders },
  )
  if (!cabRes.ok) return jsonRes({ error: `cargar compra ${cabRes.status}` }, 500)
  const cabRows = await cabRes.json() as CompraRow[]
  if (cabRows.length === 0) return jsonRes({ error: 'compra no encontrada' }, 404)
  const compra = cabRows[0]

  if (compra.holded_purchase_id) {
    return jsonRes({
      error: 'compra ya subida a Holded',
      holded_purchase_id: compra.holded_purchase_id,
      holded_purchase_num: compra.holded_purchase_num,
    }, 409)
  }

  const linRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos_wa_compras_lineas?compra_id=eq.${body.compra_id}&select=orden,codigo_proveedor,descripcion,cantidad,unidad,precio_unitario,iva_pct,importe&order=orden`,
    { headers: dbHeaders },
  )
  if (!linRes.ok) return jsonRes({ error: `cargar líneas ${linRes.status}` }, 500)
  const lineas = await linRes.json() as CompraLineaRow[]
  if (lineas.length === 0) return jsonRes({ error: 'compra sin líneas' }, 422)

  const holdedBody = buildHoldedBody(compra, lineas)

  if (dryRun) {
    return jsonRes({
      ok: true,
      dry_run: true,
      holded_endpoint: HOLDED_PURCHASE_URL,
      body: holdedBody,
      summary: {
        proveedor:   compra.proveedor_nombre,
        num_factura: compra.num_factura,
        fecha:       compra.fecha,
        lineas:      lineas.length,
        total_bruto: Number(compra.total_bruto),
        total:       Number(compra.total),
      },
    })
  }

  let holdedRes: Response
  try {
    holdedRes = await fetch(HOLDED_PURCHASE_URL, {
      method: 'POST',
      headers: { key: HOLDED_KEY, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(holdedBody),
    })
  } catch (e) {
    return jsonRes({
      error: 'fetch a Holded falló',
      detail: e instanceof Error ? e.message : String(e),
    }, 502)
  }

  const holdedTxt = await holdedRes.text()
  let holdedJson: { status?: number; id?: string; invoiceNum?: string; docNumber?: string; info?: string } = {}
  try { holdedJson = JSON.parse(holdedTxt) } catch { /* */ }

  if (!holdedRes.ok || !holdedJson.id) {
    return jsonRes({
      error: `Holded ${holdedRes.status}`,
      detail: holdedTxt.slice(0, 600),
      sent_body: holdedBody,
    }, 502)
  }

  const purchaseNum = holdedJson.invoiceNum ?? holdedJson.docNumber ?? null
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos_wa_compras?id=eq.${body.compra_id}`,
    {
      method: 'PATCH',
      headers: { ...dbHeaders, prefer: 'return=minimal' },
      body: JSON.stringify({
        holded_purchase_id:         holdedJson.id,
        holded_purchase_num:        purchaseNum,
        holded_purchase_created_at: new Date().toISOString(),
      }),
    },
  )
  if (!patchRes.ok) {
    return jsonRes({
      ok: false,
      warning: 'Subido a Holded pero update BD falló — anota el id manualmente',
      holded_purchase_id: holdedJson.id,
      holded_purchase_num: purchaseNum,
      bd_error: (await patchRes.text()).slice(0, 400),
    }, 207)
  }

  return jsonRes({
    ok: true,
    holded_purchase_id: holdedJson.id,
    holded_purchase_num: purchaseNum,
  })
})
