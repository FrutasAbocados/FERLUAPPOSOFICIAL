// Edge Function: compra-a-holded
// Sube una factura de proveedor a Holded como documents/purchase.
// Idempotente — si ya tiene holded_purchase_id, devuelve 409.
//
// Body: { compra_id: uuid, dry_run?: boolean }
// Auth: admin_full | admin_op
//
// FIX 2026-05-08: documents/purchase usa `subtotal` como PRECIO UNITARIO
// (no `price` como invoice/waybill). Confirmado via experimentos en
// debug-holded-get. Tampoco se envía `sku` (Holded vincula al catálogo).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HOLDED_KEY   = Deno.env.get('HOLDED_API_KEY') || ''
const HOLDED_PURCHASE_URL = 'https://api.holded.com/api/invoicing/v1/documents/purchase'

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

function fechaToUnixMadrid(fechaIso: string): number {
  const d = new Date(fechaIso + 'T12:00:00Z')
  return Math.floor(d.getTime() / 1000)
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) throw new Error('jwt sin payload')
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - b64.length % 4) % 4
  return JSON.parse(atob(b64 + '='.repeat(pad)))
}

async function checkAuthAdmin(req: Request): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
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
  const rows = await res.json() as Array<{ role?: string }>
  const userRole = rows[0]?.role ?? ''
  if (!['admin_full', 'admin_op'].includes(userRole)) return { ok: false, status: 403, msg: 'solo admin' }
  return { ok: true }
}

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

/** Defensa: si precio_unitario=0 pero importe y cantidad cuadran, deriva precio. */
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
    items:       lineas.map(l => {
      // Código proveedor va en la descripción de la línea, NO como sku
      // (porque sku hace que Holded pise el precio con el del catalogo).
      const descParts = [`${Number(l.cantidad)} ${l.unidad}`]
      if (l.codigo_proveedor) descParts.push(`ref ${l.codigo_proveedor}`)
      return {
        name:     l.descripcion,
        desc:     descParts.join(' · '),
        units:    Number(l.cantidad),
        // ⚠️ documents/purchase usa `subtotal` como precio unitario.
        // El campo `price` se ignora silenciosamente en este endpoint.
        subtotal: precioReparado(l),
        tax:      Number(l.iva_pct),
      }
    }),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = await checkAuthAdmin(req)
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

  if (compra.holded_purchase_id && !dryRun) {
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
