// Edge Function: compra-a-holded
// ----------------------------------------------------------------------------
// Sube una factura de proveedor (pedidos_wa_compras) a Holded como
// documents/purchase. Idempotente — si la compra ya tiene holded_purchase_id,
// devuelve 409 sin tocar nada.
//
// Body: { compra_id: uuid, dry_run?: boolean }
//   dry_run=true → devuelve el body Holded resuelto SIN POST a Holded.
//
// Auth: admin_full | admin_op (clon del patrón de holded-sync).
// ----------------------------------------------------------------------------

const HOLDED_PURCHASE_URL = 'https://api.holded.com/api/invoicing/v1/documents/purchase'

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

// Holded espera Unix segundos = 00:00 hora Madrid del día de la factura.
function fechaToUnixMadrid(fechaIso: string): number {
  // fechaIso = 'YYYY-MM-DD'. Construimos 00:00 Madrid restando el offset CET/CEST.
  // Madrid = UTC+1 (CET) o UTC+2 (CEST). Para evitar libs, usamos un truco:
  // crear la fecha como UTC y restar 1h (peor caso 2h). Holded normaliza al
  // calendar date local, no importa si caemos a 22:00 o 23:00 UTC del día anterior:
  // Holded re-formatea con timezone usuario. Más seguro: 12:00 UTC del día.
  const d = new Date(fechaIso + 'T12:00:00Z')
  return Math.floor(d.getTime() / 1000)
}

// ─── Auth (igual a holded-sync) ──────────────────────────────────────────────
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
  if (userRole !== 'admin_full' && userRole !== 'admin_op') {
    return { ok: false, status: 403, msg: 'sólo admin_full o admin_op pueden subir compras a Holded' }
  }
  return { ok: true }
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
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

// ─── Build Holded body ───────────────────────────────────────────────────────
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
      price: Number(l.precio_unitario),
      tax:   Number(l.iva_pct),
      sku:   l.codigo_proveedor || undefined,
    })),
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = await checkAuth(req)
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.msg }), {
      status: auth.status, headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  if (!HOLDED_KEY) {
    return new Response(JSON.stringify({ error: 'HOLDED_API_KEY no configurada' }), {
      status: 500, headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  let body: { compra_id?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  if (!body.compra_id) {
    return new Response(JSON.stringify({ error: 'falta compra_id' }), {
      status: 400, headers: { ...cors, 'content-type': 'application/json' },
    })
  }
  const dryRun = body.dry_run === true

  // Cargar compra + lineas
  const cabRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos_wa_compras?id=eq.${body.compra_id}&select=*`,
    { headers: dbHeaders },
  )
  if (!cabRes.ok) {
    return new Response(JSON.stringify({ error: `cargar compra ${cabRes.status}` }), {
      status: 500, headers: { ...cors, 'content-type': 'application/json' },
    })
  }
  const cabRows = await cabRes.json() as CompraRow[]
  if (cabRows.length === 0) {
    return new Response(JSON.stringify({ error: 'compra no encontrada' }), {
      status: 404, headers: { ...cors, 'content-type': 'application/json' },
    })
  }
  const compra = cabRows[0]

  if (compra.holded_purchase_id) {
    return new Response(JSON.stringify({
      error: 'compra ya subida a Holded',
      holded_purchase_id: compra.holded_purchase_id,
      holded_purchase_num: compra.holded_purchase_num,
    }), { status: 409, headers: { ...cors, 'content-type': 'application/json' } })
  }

  const linRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos_wa_compras_lineas?compra_id=eq.${body.compra_id}&select=orden,codigo_proveedor,descripcion,cantidad,unidad,precio_unitario,iva_pct,importe&order=orden`,
    { headers: dbHeaders },
  )
  if (!linRes.ok) {
    return new Response(JSON.stringify({ error: `cargar líneas ${linRes.status}` }), {
      status: 500, headers: { ...cors, 'content-type': 'application/json' },
    })
  }
  const lineas = await linRes.json() as CompraLineaRow[]
  if (lineas.length === 0) {
    return new Response(JSON.stringify({ error: 'compra sin líneas' }), {
      status: 422, headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  const holdedBody = buildHoldedBody(compra, lineas)

  if (dryRun) {
    return new Response(JSON.stringify({
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
    }, null, 2), { headers: { ...cors, 'content-type': 'application/json' } })
  }

  // POST a Holded
  let holdedRes: Response
  try {
    holdedRes = await fetch(HOLDED_PURCHASE_URL, {
      method: 'POST',
      headers: { key: HOLDED_KEY, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(holdedBody),
    })
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'fetch a Holded falló', detail: e instanceof Error ? e.message : String(e),
    }), { status: 502, headers: { ...cors, 'content-type': 'application/json' } })
  }

  const holdedTxt = await holdedRes.text()
  let holdedJson: { status?: number; id?: string; invoiceNum?: string; docNumber?: string; info?: string } = {}
  try { holdedJson = JSON.parse(holdedTxt) } catch { /* */ }

  if (!holdedRes.ok || !holdedJson.id) {
    return new Response(JSON.stringify({
      error: `Holded ${holdedRes.status}`,
      detail: holdedTxt.slice(0, 600),
      sent_body: holdedBody,
    }), { status: 502, headers: { ...cors, 'content-type': 'application/json' } })
  }

  // Update BD con id Holded
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
    // POST a Holded ya hecho, pero update BD falló — devolvemos el id para que
    // Luis pueda meterlo a mano. Sin retry automático para no duplicar en Holded.
    return new Response(JSON.stringify({
      ok: false,
      warning: 'Subido a Holded pero update BD falló — anota el id manualmente',
      holded_purchase_id: holdedJson.id,
      holded_purchase_num: purchaseNum,
      bd_error: await patchRes.text().then(t => t.slice(0, 400)),
    }), { status: 207, headers: { ...cors, 'content-type': 'application/json' } })
  }

  return new Response(JSON.stringify({
    ok: true,
    holded_purchase_id: holdedJson.id,
    holded_purchase_num: purchaseNum,
  }), { headers: { ...cors, 'content-type': 'application/json' } })
})
