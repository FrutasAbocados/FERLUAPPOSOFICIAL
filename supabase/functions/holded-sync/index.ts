// Edge Function: holded-sync
// ----------------------------------------------------------------------------
// Sync de ventas (invoice) y compras (purchase) desde la API de Holded a las
// tablas manager_* del proyecto Ferlu. Idempotente — upsert por `id` Holded.
//
// Body JSON opcional:
//   { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "trigger": "manual|cron|backfill" }
// Defaults: start = hoy - 7d, end = hoy, trigger = "manual"
//
// La API de Holded devuelve máx 500 documentos por respuesta — troceamos por
// chunks de 30 días. Sin dependencias npm: usa fetch directo a PostgREST con
// la SUPABASE_SERVICE_ROLE_KEY (bypass RLS).
// ----------------------------------------------------------------------------

const HOLDED_BASE = 'https://api.holded.com/api/invoicing/v1/documents'
const HOLDED_TIMEOUT_MS = 15_000
const DB_TIMEOUT_MS = 20_000

type DocType = 'invoice' | 'salesreceipt' | 'waybill' | 'creditnote' | 'purchase' | 'purchaserefund'

const DOC_TYPES: DocType[] = ['invoice', 'salesreceipt', 'waybill', 'creditnote', 'purchase', 'purchaserefund']

function tipoFromDocType(d: DocType): 'VENTA' | 'COMPRA' {
  return (d === 'purchase' || d === 'purchaserefund') ? 'COMPRA' : 'VENTA'
}

interface HoldedLine {
  line_id?: string
  name?: string
  desc?: string
  price?: number
  units?: number
  tax?: number
  discount?: number
  costPrice?: number
  sku?: string
  productId?: string
  variantId?: string
  account?: string
}

interface HoldedDoc {
  id: string
  docNumber?: string
  contact?: string
  contactName?: string
  date?: number
  dueDate?: number
  desc?: string
  notes?: string
  subtotal?: number
  tax?: number
  discount?: number
  total?: number
  status?: number
  paymentsTotal?: number
  paymentsPending?: number
  paymentsRefunds?: number
  currency?: string
  tags?: string[]
  products?: HoldedLine[]
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HOLDED_KEY = Deno.env.get('HOLDED_API_KEY') || ''

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = DB_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`timeout ${timeoutMs}ms: ${input.split('?')[0]}`, { cause: err })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// Holded almacena fechas como Unix timestamp = 00:00 hora Madrid. Si convertimos
// con toISOString (UTC), las facturas creadas en Madrid 00:00–02:00 caen un día
// antes. Usamos Intl con timezone Madrid para sacar el calendar date correcto.
const madridDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric', month: '2-digit', day: '2-digit',
})

function unixToDate(s?: number): string | null {
  if (!s) return null
  return madridDateFmt.format(new Date(s * 1000))  // YYYY-MM-DD en zona Madrid
}

function cleanName(raw?: string): string {
  if (!raw) return ''
  const i = raw.toLowerCase().indexOf('trazab')
  if (i >= 0) return raw.slice(0, i).trim()
  return raw.trim()
}

function chunkRange(start: Date, end: Date, days = 30): Array<[Date, Date]> {
  const out: Array<[Date, Date]> = []
  let cur = new Date(start)
  while (cur <= end) {
    const next = new Date(cur)
    next.setUTCDate(next.getUTCDate() + days - 1)
    if (next > end) next.setTime(end.getTime())
    out.push([new Date(cur), new Date(next)])
    cur = new Date(next)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

async function fetchHolded(doc: DocType, starttmp: number, endtmp: number): Promise<HoldedDoc[]> {
  const url = `${HOLDED_BASE}/${doc}?starttmp=${starttmp}&endtmp=${endtmp}&sort=created-desc`
  const res = await fetchWithTimeout(url, { headers: { key: HOLDED_KEY, accept: 'application/json' } }, HOLDED_TIMEOUT_MS)
  if (!res.ok) throw new Error(`Holded ${doc} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(`Holded ${doc}: respuesta inesperada`)
  if (data.length >= 500) console.warn(`[holded-sync] ${doc} ${starttmp}-${endtmp} truncado a 500`)
  return data as HoldedDoc[]
}

async function fetchHoldedLatest(doc: DocType): Promise<HoldedDoc[]> {
  const url = `${HOLDED_BASE}/${doc}?sort=created-desc`
  const res = await fetchWithTimeout(url, { headers: { key: HOLDED_KEY, accept: 'application/json' } }, HOLDED_TIMEOUT_MS)
  if (!res.ok) throw new Error(`Holded ${doc} (sin rango) ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(`Holded ${doc} (sin rango): respuesta inesperada`)
  return data as HoldedDoc[]
}

async function pgUpsert(table: string, rows: unknown[], onConflict: string): Promise<void> {
  if (!rows.length) return
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { ...dbHeaders, prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`upsert ${table} ${res.status}: ${(await res.text()).slice(0, 400)}`)
}

async function pgInsert(table: string, rows: unknown[]): Promise<void> {
  if (!rows.length) return
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...dbHeaders, prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`insert ${table} ${res.status}: ${(await res.text()).slice(0, 400)}`)
}

async function pgDeleteIn(table: string, column: string, values: string[]): Promise<void> {
  if (!values.length) return
  const list = values.map(v => `"${v}"`).join(',')
  const url = `${SUPABASE_URL}/rest/v1/${table}?${column}=in.(${list})`
  const res = await fetchWithTimeout(url, { method: 'DELETE', headers: dbHeaders })
  if (!res.ok) throw new Error(`delete ${table} ${res.status}: ${(await res.text()).slice(0, 400)}`)
}

async function pgInsertReturning(table: string, row: Record<string, unknown>): Promise<{ id: number }> {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...dbHeaders, prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`insert ${table} ${res.status}: ${(await res.text()).slice(0, 400)}`)
  const arr = await res.json()
  return arr[0]
}

async function pgUpdate(table: string, id: number | string, patch: Record<string, unknown>): Promise<void> {
  const idCol = typeof id === 'number' ? 'id' : 'id'
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}?${idCol}=eq.${id}`, {
    method: 'PATCH',
    headers: { ...dbHeaders, prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`update ${table} ${res.status}: ${(await res.text()).slice(0, 400)}`)
}

// Lanzar holded-sync sólo desde cron (service_role) o admins (admin_full|admin_op).
// La verificación de firma del JWT la hace el runtime de Supabase (verify_jwt=true);
// aquí sólo decodificamos los claims para enrutar por rol.
function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) throw new Error('jwt sin payload')
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - b64.length % 4) % 4
  return JSON.parse(atob(b64 + '='.repeat(pad)))
}

type AuthOk = { kind: 'service_role' } | { kind: 'admin'; user_id: string; role: string }

async function checkAuth(req: Request): Promise<AuthOk | { kind: 'deny'; status: number; msg: string }> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { kind: 'deny', status: 401, msg: 'falta Authorization' }

  let payload: Record<string, unknown>
  try { payload = decodeJwtPayload(token) }
  catch { return { kind: 'deny', status: 401, msg: 'jwt inválido' } }

  const role = String(payload.role ?? '')
  if (role === 'service_role') return { kind: 'service_role' }
  if (role !== 'authenticated') return { kind: 'deny', status: 403, msg: `rol JWT no permitido: ${role || '—'}` }

  const sub = String(payload.sub ?? '')
  if (!sub) return { kind: 'deny', status: 403, msg: 'jwt sin sub' }

  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sub}&select=role`, { headers: dbHeaders })
  if (!res.ok) return { kind: 'deny', status: 500, msg: `profiles ${res.status}` }
  const rows = await res.json() as Array<{ role?: string }>
  const userRole = rows[0]?.role ?? ''
  if (userRole !== 'admin_full' && userRole !== 'admin_op') {
    return { kind: 'deny', status: 403, msg: 'sólo admin_full o admin_op pueden lanzar holded-sync' }
  }
  return { kind: 'admin', user_id: sub, role: userRole }
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = await checkAuth(req)
  if (auth.kind === 'deny') {
    return new Response(JSON.stringify({ error: auth.msg }), {
      status: auth.status, headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  if (!HOLDED_KEY) {
    return new Response(JSON.stringify({ error: 'HOLDED_API_KEY no configurada' }), {
      status: 500, headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  let body: { start?: string; end?: string; trigger?: string; probe?: boolean } = {}
  try { body = await req.json() } catch { /* defaults */ }

  const today = new Date()
  // Default: últimos 60 días. Ediciones a posteriori en Holded de docs con
  // fecha varias semanas atrás son habituales (albaranes recibidos tarde, etc).
  // El cron horario re-fetcha esa ventana — los upserts son idempotentes.
  const defaultStart = new Date(today); defaultStart.setUTCDate(defaultStart.getUTCDate() - 60)
  // start/end en Madrid time: ampliamos ±3h sobre UTC para cubrir el offset CET/CEST
  // (los upserts son idempotentes por id, sobre-fetch no es problema).
  const start = body.start ? new Date(body.start + 'T00:00:00Z') : defaultStart
  const end = body.end ? new Date(body.end + 'T23:59:59Z') : today
  start.setUTCHours(start.getUTCHours() - 3)
  end.setUTCHours(end.getUTCHours() + 3)
  const trigger = (body.trigger as 'manual'|'cron'|'backfill') || 'manual'

  // Probe mode: conteos por docType en el rango, sin tocar BD.
  // Si body.contactFilter, devuelve TODOS los docs cuyo contactName contiene
  // ese substring (case-insensitive) — útil para conciliar con Holded.
  if (body.probe) {
    const probeTypes = [
      'invoice', 'salesreceipt', 'waybill', 'creditnote',
      'purchase', 'purchaserefund',
    ]
    const filter = (body.contactFilter as string | undefined)?.toLowerCase()
    const out: Record<string, { docs: number; subtotal: number; total: number; truncated: boolean; matches?: unknown[] }> = {}
    for (const [a, b] of chunkRange(start, end, 30)) {
      const starttmp = Math.floor(a.getTime() / 1000)
      const endtmp = Math.floor(b.getTime() / 1000)
      for (const dt of probeTypes) {
        try {
          const arr = await fetchHolded(dt as DocType, starttmp, endtmp) as Array<{ id?: string; subtotal?: number; total?: number; date?: number; docNumber?: string; contactName?: string }>
          if (!Array.isArray(arr)) continue
          out[dt] = out[dt] ?? { docs: 0, subtotal: 0, total: 0, truncated: false, matches: [] }
          out[dt].docs += arr.length
          out[dt].subtotal += arr.reduce((s, d) => s + (d.subtotal ?? 0), 0)
          out[dt].total += arr.reduce((s, d) => s + (d.total ?? 0), 0)
          if (arr.length >= 500) out[dt].truncated = true
          if (filter) {
            const hit = arr.filter(d => (d.contactName ?? '').toLowerCase().includes(filter))
            out[dt].matches!.push(...hit.map(d => ({
              id: d.id, docNumber: d.docNumber, contactName: d.contactName,
              date: d.date, fecha_madrid: d.date ? madridDateFmt.format(new Date(d.date * 1000)) : null,
              subtotal: d.subtotal, total: d.total,
            })))
          }
        } catch { /* skip */ }
      }
    }
    return new Response(JSON.stringify({
      mode: 'probe',
      range: { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) },
      contactFilter: filter ?? null,
      counts: out,
    }, null, 2), { headers: { ...cors, 'content-type': 'application/json' } })
  }

  const log = await pgInsertReturning('manager_holded_sync', {
    trigger,
    range_start: start.toISOString().slice(0, 10),
    range_end: end.toISOString().slice(0, 10),
  })
  const logId = log.id

  let ventas = 0, compras = 0, lineasCount = 0
  const contactosSet = new Set<string>()
  const errors: string[] = []
  // IDs de compras ya procesadas en el pase con rango de fechas
  const processedFacIds = new Set<string>()

  try {
    for (const [a, b] of chunkRange(start, end, 30)) {
      const starttmp = Math.floor(a.getTime() / 1000)
      const endtmp = Math.floor(b.getTime() / 1000)

      for (const docType of DOC_TYPES) {
        const tipo = tipoFromDocType(docType)
        let docs: HoldedDoc[]
        try { docs = await fetchHolded(docType, starttmp, endtmp) }
        catch (e) { errors.push(e instanceof Error ? e.message : String(e)); continue }
        if (docs.length === 0) continue

        // Contactos (dedup por id)
        const contactRows = Array.from(new Map(
          docs.filter(d => d.contact && d.contactName).map(d => [d.contact!, {
            id: d.contact!, nombre: d.contactName!, raw: { from: docType },
          }])
        ).values())
        try {
          await pgUpsert('manager_contactos', contactRows, 'id')
          contactRows.forEach(c => contactosSet.add(c.id))
        } catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }

        // Facturas
        const facturaRows = docs.map(d => ({
          id: d.id,
          tipo,
          subtipo: docType,
          doc_number: d.docNumber ?? null,
          contact_id: d.contact ?? null,
          contact_name: d.contactName ?? null,
          fecha: unixToDate(d.date),
          fecha_vencimiento: unixToDate(d.dueDate),
          descripcion: d.desc ?? d.notes ?? null,
          subtotal: d.subtotal ?? null,
          impuestos: d.tax ?? null,
          descuento: d.discount ?? null,
          total: d.total ?? null,
          status: d.status ?? null,
          payments_total: d.paymentsTotal ?? null,
          payments_pending: d.paymentsPending ?? null,
          payments_refunds: d.paymentsRefunds ?? null,
          currency: d.currency ?? null,
          tags: d.tags ?? null,
          raw: d,
          updated_at: new Date().toISOString(),
        }))
        try {
          // Upsert en lotes de 500
          for (let i = 0; i < facturaRows.length; i += 500) {
            await pgUpsert('manager_facturas', facturaRows.slice(i, i + 500), 'id')
          }
          if (tipo === 'VENTA') ventas += facturaRows.length
          else {
            compras += facturaRows.length
            facturaRows.forEach(f => processedFacIds.add(f.id as string))
          }
        } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); continue }

        // Líneas: borrar las antiguas + insertar
        const facIds = facturaRows.map(f => f.id)
        try {
          for (let i = 0; i < facIds.length; i += 100) {
            await pgDeleteIn('manager_lineas', 'factura_id', facIds.slice(i, i + 100))
          }
        } catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }

        const lineaRows: Record<string, unknown>[] = []
        for (const d of docs) {
          const fecha = unixToDate(d.date)
          const products = d.products ?? []
          for (let idx = 0; idx < products.length; idx++) {
            const p = products[idx]
            // Holded LIST no devuelve line_id estable. La PK es (factura_id, id)
            // y borramos+reinsertamos por factura_id, así que basta con que id
            // sea único dentro de la factura: usamos el índice del array.
            const lineId = p.line_id ?? `L${idx}`
            const subtotalLinea = (p.price ?? 0) * (p.units ?? 0) * (1 - (p.discount ?? 0) / 100)
            lineaRows.push({
              id: lineId,
              factura_id: d.id,
              tipo,
              subtipo: docType,
              fecha,
              contact_id: d.contact ?? null,
              nombre: cleanName(p.name),
              nombre_raw: p.name ?? null,
              descripcion: p.desc ?? null,
              sku: p.sku ?? null,
              product_id: p.productId ?? null,
              variant_id: p.variantId ?? null,
              cuenta: p.account ?? null,
              units: p.units ?? null,
              price: p.price ?? null,
              cost_price: p.costPrice ?? null,
              tax_rate: p.tax ?? null,
              discount: p.discount ?? null,
              subtotal: Number(subtotalLinea.toFixed(2)),
              raw: p,
            })
          }
        }
        try {
          for (let i = 0; i < lineaRows.length; i += 500) {
            const batch = lineaRows.slice(i, i + 500)
            await pgInsert('manager_lineas', batch)
            lineasCount += batch.length
          }
        } catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }
      }
    }

    // Pase sin filtro de fecha para purchase/purchaserefund:
    // Holded excluye borradores del endpoint con starttmp/endtmp.
    // Llamando sin rango obtenemos los 500 más recientes (created-desc),
    // que incluye borradores del día aunque no tengan fecha confirmada.
    for (const draftType of ['purchase', 'purchaserefund'] as DocType[]) {
      let draftDocs: HoldedDoc[]
      try {
        draftDocs = await fetchHoldedLatest(draftType)
      } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); continue }

      // Solo borradores REALES: sin fecha (d.date===0 o null) y no procesados ya.
      // Sin este filtro se re-procesan las 500 más recientes cada hora → bloat masivo.
      const nuevos = draftDocs.filter(d => !processedFacIds.has(d.id) && (!d.date || d.date === 0))
      if (!nuevos.length) continue

      const contactRows = Array.from(new Map(
        nuevos.filter(d => d.contact && d.contactName).map(d => [d.contact!, {
          id: d.contact!, nombre: d.contactName!, raw: { from: draftType },
        }])
      ).values())
      try {
        await pgUpsert('manager_contactos', contactRows, 'id')
        contactRows.forEach(c => contactosSet.add(c.id))
      } catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }

      const draftFacturaRows = nuevos.map(d => ({
        id: d.id,
        tipo: 'COMPRA' as const,
        subtipo: draftType,
        doc_number: d.docNumber ?? null,
        contact_id: d.contact ?? null,
        contact_name: d.contactName ?? null,
        fecha: unixToDate(d.date),
        fecha_vencimiento: unixToDate(d.dueDate),
        descripcion: d.desc ?? d.notes ?? null,
        subtotal: d.subtotal ?? null,
        impuestos: d.tax ?? null,
        descuento: d.discount ?? null,
        total: d.total ?? null,
        status: d.status ?? null,
        payments_total: d.paymentsTotal ?? null,
        payments_pending: d.paymentsPending ?? null,
        payments_refunds: d.paymentsRefunds ?? null,
        currency: d.currency ?? null,
        tags: d.tags ?? null,
        raw: d,
        updated_at: new Date().toISOString(),
      }))
      try {
        for (let i = 0; i < draftFacturaRows.length; i += 500) {
          await pgUpsert('manager_facturas', draftFacturaRows.slice(i, i + 500), 'id')
        }
        compras += draftFacturaRows.length
      } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); continue }

      const draftFacIds = draftFacturaRows.map(f => f.id)
      try {
        for (let i = 0; i < draftFacIds.length; i += 100) {
          await pgDeleteIn('manager_lineas', 'factura_id', draftFacIds.slice(i, i + 100))
        }
      } catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }

      const draftLineaRows: Record<string, unknown>[] = []
      for (const d of nuevos) {
        const fecha = unixToDate(d.date)
        const products = d.products ?? []
        for (let idx = 0; idx < products.length; idx++) {
          const p = products[idx]
          const lineId = p.line_id ?? `L${idx}`
          const subtotalLinea = (p.price ?? 0) * (p.units ?? 0) * (1 - (p.discount ?? 0) / 100)
          draftLineaRows.push({
            id: lineId, factura_id: d.id, tipo: 'COMPRA', subtipo: draftType, fecha,
            contact_id: d.contact ?? null, nombre: cleanName(p.name), nombre_raw: p.name ?? null,
            descripcion: p.desc ?? null, sku: p.sku ?? null, product_id: p.productId ?? null,
            variant_id: p.variantId ?? null, cuenta: p.account ?? null,
            units: p.units ?? null, price: p.price ?? null, cost_price: p.costPrice ?? null,
            tax_rate: p.tax ?? null, discount: p.discount ?? null,
            subtotal: Number(subtotalLinea.toFixed(2)), raw: p,
          })
        }
      }
      try {
        for (let i = 0; i < draftLineaRows.length; i += 500) {
          const batch = draftLineaRows.slice(i, i + 500)
          await pgInsert('manager_lineas', batch)
          lineasCount += batch.length
        }
      } catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }
    }

    const ok = errors.length === 0
    await pgUpdate('manager_holded_sync', logId, {
      finished_at: new Date().toISOString(),
      ventas_upserted: ventas,
      compras_upserted: compras,
      contactos_upserted: contactosSet.size,
      lineas_upserted: lineasCount,
      ok,
      error: ok ? null : errors.slice(0, 5).join(' | '),
    })

    return new Response(JSON.stringify({
      ok, log_id: logId, ventas, compras, contactos: contactosSet.size, lineas: lineasCount,
      errors: errors.slice(0, 10),
    }), { headers: { ...cors, 'content-type': 'application/json' } })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await pgUpdate('manager_holded_sync', logId, {
      finished_at: new Date().toISOString(), ok: false, error: msg,
    }).catch(() => {})
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...cors, 'content-type': 'application/json' },
    })
  }
})
