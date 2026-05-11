// Edge Function: pedido-a-holded
// Sube un pedido WA a Holded como factura (invoice) o albarán (waybill) según
// pedidos_wa_clientes.holded_doc_type. Idempotente vía pedidos_wa.holded_invoice_id.
//
// Body: { pedido_id: uuid, dry_run?: boolean, auto?: boolean }
// Auth: admin_full | admin_op | responsable, o JWT service_role / anon (trigger).

// ── inline de _shared/holded.ts ──────────────────────────────────────────────
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
function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { ...cors, 'content-type': 'application/json' },
  })
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
type AppRole = 'admin_full' | 'admin_op' | 'responsable' | 'empleado'
type AuthOk = { ok: true }
type AuthFail = { ok: false; status: number; msg: string }
type AuthResult = AuthOk | AuthFail
async function checkAuth(
  req: Request,
  options: { allowedRoles: AppRole[]; allowAnon?: boolean } = { allowedRoles: ['admin_full', 'admin_op'] },
): Promise<AuthResult> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, msg: 'falta Authorization' }
  let payload: Record<string, unknown>
  try { payload = decodeJwtPayload(token) }
  catch { return { ok: false, status: 401, msg: 'jwt inválido' } }
  const role = String(payload.role ?? '')
  if (role === 'service_role') return { ok: true }
  if (role === 'anon' && options.allowAnon !== false) return { ok: true }
  if (role !== 'authenticated') {
    return { ok: false, status: 403, msg: `rol JWT no permitido: ${role || '—'}` }
  }
  const sub = String(payload.sub ?? '')
  if (!sub) return { ok: false, status: 403, msg: 'jwt sin sub' }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${sub}&select=role`,
    { headers: dbHeaders },
  )
  if (!res.ok) return { ok: false, status: 500, msg: `profiles ${res.status}` }
  const rows = await res.json() as Array<{ role?: string }>
  const userRole = (rows[0]?.role ?? '') as AppRole
  if (!options.allowedRoles.includes(userRole)) {
    return { ok: false, status: 403, msg: `solo ${options.allowedRoles.join('|')} pueden ejecutar esta operación` }
  }
  return { ok: true }
}
// ─────────────────────────────────────────────────────────────────────────────

// Helper Sentry inline (no-op si SENTRY_EDGE_DSN vacío).
const SENTRY_DSN_HOLDED = Deno.env.get('SENTRY_EDGE_DSN') ?? ''
async function reportEdgeError(error: unknown, context: { fn: string; extra?: Record<string, unknown> } = { fn: 'unknown' }): Promise<void> {
  if (!SENTRY_DSN_HOLDED) return
  const m = SENTRY_DSN_HOLDED.match(new RegExp('^(https?):' + '//([^@]+)@([^/]+)/(\\d+)$'))
  if (!m) return
  const [, protocol, publicKey, host, projectId] = m
  const message = error instanceof Error ? error.message : String(error)
  const eventId = crypto.randomUUID().replace(/-/g, '')
  const now = new Date().toISOString()
  const event = {
    event_id: eventId, timestamp: now, platform: 'javascript', level: 'error',
    server_name: context.fn,
    environment: Deno.env.get('SENTRY_ENV') ?? 'production',
    tags: { runtime: 'deno-edge', function: context.fn, tenant: 'ferlu', app: 'abocados-os' },
    extra: context.extra ?? {},
    exception: { values: [{ type: error instanceof Error ? error.name : 'Error', value: message }] },
  }
  const body = `${JSON.stringify({ event_id: eventId, sent_at: now, dsn: SENTRY_DSN_HOLDED })}\n${JSON.stringify({ type: 'event', length: 0 })}\n${JSON.stringify(event)}\n`
  try {
    await fetch(`${protocol}://${host}/api/${projectId}/envelope/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=abocados-edge/1.0`,
      },
      body,
    })
  } catch { /* fire-and-forget */ }
}

interface PedidoRow {
  id: string
  cliente_id: string
  fecha: string
  texto_original: string | null
  notas_admin: string | null
  faltas: string | null
  estado: string
  holded_invoice_id: string | null
  holded_invoice_num: string | null
  holded_invoice_doc_type: string | null
  cliente: {
    id: string
    nombre: string
    holded_contact_id: string | null
    tipo_factura: string
    holded_doc_type: string | null
  }
}

interface PrecioResuelto {
  linea_id: string
  orden: number
  producto_normalizado: string
  cantidad: number | string
  unidad: string
  es_gratis: boolean
  iva_pct: number | string
  precio_resuelto: number | string | null
  precio_fuente: 'historico_cliente' | 'tarifa_base' | 'no_resuelto' | 'gratis'
  precio_fecha: string | null
  total_estimado: number | string
  holded_product_id: string | null
  holded_product_name: string | null
  trazabilidad: string | null
}

async function writeLog(row: {
  pedido_id: string
  source: 'trigger' | 'manual' | 'retry'
  status: number | null
  ok: boolean
  doc_type?: 'invoice' | 'waybill' | null
  holded_id?: string | null
  holded_num?: string | null
  error_msg?: string | null
  request_body?: unknown
  response_body?: unknown
}) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/pedidos_wa_holded_log`, {
      method: 'POST',
      headers: { ...dbHeaders, prefer: 'return=minimal' },
      body: JSON.stringify(row),
    })
  } catch { /* no romper la respuesta principal por un fallo de log */ }
}

function buildHoldedBody(p: PedidoRow, lineas: PrecioResuelto[]) {
  const sinPrecio = lineas.filter(l => !l.es_gratis && l.precio_fuente === 'no_resuelto').length
  const sinTraza = lineas.filter(l => !l.es_gratis && !l.trazabilidad).length
  const noteParts = [
    p.texto_original ? `WhatsApp:\n${p.texto_original}` : null,
    p.notas_admin   ? `Notas: ${p.notas_admin}` : null,
    p.faltas        ? `Faltas: ${p.faltas}` : null,
    sinPrecio > 0   ? `⚠️ ${sinPrecio} línea(s) sin precio en histórico — quedan a 0€, revisar en Holded.` : null,
    sinTraza > 0    ? `⚠️ ${sinTraza} línea(s) sin trazabilidad — completar lote+proveedor antes de aprobar.` : null,
  ].filter(Boolean)

  return {
    // approveDoc=0 → borrador (no aprobado, sin numeración oficial, no notifica al cliente)
    approveDoc: 0,
    contactId:   p.cliente.holded_contact_id,
    // NO enviar contactName cuando hay contactId: Holded usa el nombre fiscal
    // del contacto almacenado. Si lo enviamos con nombre de display pisamos
    // la razón social y la factura sería inválida fiscalmente.
    ...(!p.cliente.holded_contact_id ? { contactName: p.cliente.nombre } : {}),
    desc:        `Pedido WhatsApp ${p.fecha}`,
    date:        fechaToUnixMadrid(p.fecha),
    notes:       noteParts.join('\n\n') || undefined,
    language:    'es',
    currency:    'eur',
    items:       lineas
      .filter(l => !(l.es_gratis && Number(l.precio_resuelto ?? 0) === 0))
      .map(l => {
        // ⚠️ Holded auto-vincula por nombre exacto al catálogo aunque no se envíe
        // productId, usando el precio del catálogo (0) e ignorando el `price`
        // que enviamos. Fix: usar producto_normalizado como name (no coincide
        // con nombres del catálogo Holded que van en MAYÚSCULAS + sufijo unidad).
        // holded_product_name va en desc junto a trazabilidad para que sea legible.
        const traDesc = l.trazabilidad ?? '⚠️ Lote pendiente — completar manualmente'
        const desc = l.holded_product_name
          ? `${l.holded_product_name} · ${traDesc}`
          : traDesc
        return {
          name:  l.producto_normalizado,
          desc,
          units: Number(l.cantidad),
          price: Number(l.precio_resuelto ?? 0),
          tax:   Number(l.iva_pct),
        }
      }),
    _meta: {
      doc_type: p.cliente.holded_doc_type === 'waybill' ? 'albarán' : 'factura',
      pedido_id: p.id,
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = await checkAuth(req, { allowedRoles: ['admin_full', 'admin_op', 'responsable'] })
  if (!auth.ok) return jsonRes({ error: auth.msg }, auth.status)
  if (!HOLDED_KEY) return jsonRes({ error: 'HOLDED_API_KEY no configurada' }, 500)

  let body: { pedido_id?: string; dry_run?: boolean; auto?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  if (!body.pedido_id) return jsonRes({ error: 'falta pedido_id' }, 400)
  const dryRun = body.dry_run === true
  const auto   = body.auto === true
  const source: 'trigger' | 'manual' = auto ? 'trigger' : 'manual'
  const pedidoId = body.pedido_id

  const pedRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos_wa?id=eq.${body.pedido_id}&select=id,cliente_id,fecha,texto_original,notas_admin,faltas,estado,holded_invoice_id,holded_invoice_num,holded_invoice_doc_type,cliente:cliente_id(id,nombre,holded_contact_id,tipo_factura,holded_doc_type)`,
    { headers: dbHeaders },
  )
  if (!pedRes.ok) return jsonRes({ error: `cargar pedido ${pedRes.status}`, detail: (await pedRes.text()).slice(0, 300) }, 500)
  const pedRows = await pedRes.json() as PedidoRow[]
  if (pedRows.length === 0) return jsonRes({ error: 'pedido no encontrado' }, 404)
  const pedido = pedRows[0]

  if (pedido.holded_invoice_id) {
    if (auto) {
      return jsonRes({
        ok: true,
        already: true,
        holded_invoice_id: pedido.holded_invoice_id,
        holded_invoice_num: pedido.holded_invoice_num,
        doc_type: pedido.holded_invoice_doc_type as 'invoice' | 'waybill' | null,
      })
    }
    return jsonRes({
      error: 'pedido ya subido a Holded',
      holded_invoice_id: pedido.holded_invoice_id,
      holded_invoice_num: pedido.holded_invoice_num,
      holded_invoice_doc_type: pedido.holded_invoice_doc_type,
    }, 409)
  }

  const failValidation = async (msg: string) => {
    if (auto) await writeLog({ pedido_id: pedidoId, source, status: 422, ok: false, error_msg: msg })
    return jsonRes({ error: msg }, 422)
  }

  if (!pedido.cliente) return failValidation('pedido sin cliente')
  if (pedido.cliente.tipo_factura !== 'HOLDED') {
    return failValidation(`cliente con tipo_factura=${pedido.cliente.tipo_factura}, no se sube a Holded`)
  }
  if (!pedido.cliente.holded_contact_id) {
    return failValidation('cliente sin holded_contact_id (vinculalo primero en tab Clientes)')
  }
  if (!pedido.cliente.holded_doc_type) {
    return failValidation('cliente sin holded_doc_type (elige factura o albarán en su ficha)')
  }
  if (pedido.cliente.holded_doc_type !== 'invoice' && pedido.cliente.holded_doc_type !== 'waybill') {
    return failValidation(`holded_doc_type inválido: ${pedido.cliente.holded_doc_type}`)
  }

  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pedidos_wa_resolver_completo`, {
    method: 'POST',
    headers: dbHeaders,
    body: JSON.stringify({ p_pedido_id: body.pedido_id }),
  })
  if (!rpcRes.ok) return jsonRes({ error: `RPC resolver_completo ${rpcRes.status}`, detail: (await rpcRes.text()).slice(0, 300) }, 500)
  const lineas = await rpcRes.json() as PrecioResuelto[]
  if (lineas.length === 0) return jsonRes({ error: 'pedido sin líneas' }, 422)

  const noResueltas = lineas.filter(l => l.precio_fuente === 'no_resuelto')
  const holdedBody = buildHoldedBody(pedido, lineas)
  const docType = pedido.cliente.holded_doc_type as 'invoice' | 'waybill'
  const endpoint = `${HOLDED_BASE}/${docType}`

  if (dryRun) {
    return jsonRes({
      ok: true,
      dry_run: true,
      holded_endpoint: endpoint,
      doc_type: docType,
      body: holdedBody,
      summary: {
        cliente:      pedido.cliente.nombre,
        fecha:        pedido.fecha,
        doc_type:     docType,
        total_lineas: lineas.length,
        resueltas:    lineas.filter(l => l.precio_fuente === 'historico_cliente').length,
        tarifa_base:  lineas.filter(l => l.precio_fuente === 'tarifa_base').length,
        no_resueltas: noResueltas.length,
        gratis:       lineas.filter(l => l.es_gratis).length,
        total_estimado: lineas.reduce((s, l) => s + Number(l.total_estimado), 0),
      },
      lineas_resueltas: lineas,
    })
  }

  let holdedRes: Response
  try {
    holdedRes = await fetch(endpoint, {
      method: 'POST',
      headers: { key: HOLDED_KEY, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(holdedBody),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await writeLog({
      pedido_id: pedidoId, source, status: null, ok: false,
      doc_type: docType, error_msg: `fetch a Holded falló: ${msg}`,
      request_body: holdedBody,
    })
    await reportEdgeError(e, { fn: 'pedido-a-holded', extra: { pedidoId, docType, source, stage: 'fetch_holded' } })
    return jsonRes({ error: 'fetch a Holded falló', detail: msg }, 502)
  }

  const holdedTxt = await holdedRes.text()
  let holdedJson: { status?: number; id?: string; invoiceNum?: string; docNumber?: string } = {}
  try { holdedJson = JSON.parse(holdedTxt) } catch { /* */ }

  if (!holdedRes.ok || !holdedJson.id) {
    await writeLog({
      pedido_id: pedidoId, source, status: holdedRes.status, ok: false,
      doc_type: docType, error_msg: holdedTxt.slice(0, 500),
      request_body: holdedBody, response_body: { raw: holdedTxt.slice(0, 1000) },
    })
    return jsonRes({
      error: `Holded ${holdedRes.status}`,
      detail: holdedTxt.slice(0, 600),
      sent_body: holdedBody,
      sent_endpoint: endpoint,
    }, 502)
  }

  const docNum = holdedJson.invoiceNum ?? holdedJson.docNumber ?? null
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pedidos_wa?id=eq.${body.pedido_id}`,
    {
      method: 'PATCH',
      headers: { ...dbHeaders, prefer: 'return=minimal' },
      body: JSON.stringify({
        holded_invoice_id:         holdedJson.id,
        holded_invoice_num:        docNum,
        holded_invoice_doc_type:   docType,
        holded_invoice_created_at: new Date().toISOString(),
      }),
    },
  )
  if (!patchRes.ok) {
    const bdErr = (await patchRes.text()).slice(0, 400)
    await writeLog({
      pedido_id: pedidoId, source, status: holdedRes.status, ok: false,
      doc_type: docType, holded_id: holdedJson.id, holded_num: docNum,
      error_msg: `update BD falló: ${bdErr}`,
      request_body: holdedBody, response_body: holdedJson as unknown,
    })
    return jsonRes({
      ok: false,
      warning: 'Subido a Holded pero update BD falló — anota el id manualmente',
      holded_invoice_id: holdedJson.id,
      holded_invoice_num: docNum,
      doc_type: docType,
      bd_error: bdErr,
    }, 207)
  }

  await writeLog({
    pedido_id: pedidoId, source, status: holdedRes.status, ok: true,
    doc_type: docType, holded_id: holdedJson.id, holded_num: docNum,
    request_body: holdedBody, response_body: holdedJson as unknown,
  })

  return jsonRes({
    ok: true,
    holded_invoice_id: holdedJson.id,
    holded_invoice_num: docNum,
    doc_type: docType,
  })
})
