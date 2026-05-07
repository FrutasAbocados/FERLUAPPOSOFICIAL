// Edge Function: holded-sync-contactos
// ----------------------------------------------------------------------------
// Sincroniza direcciones de contactos desde Holded a manager_contactos.
// El sync principal (holded-sync) solo guarda id+nombre desde las facturas.
// Esta edge llama /contacts paginado y completa direccion/cp/poblacion/provincia.
//
// Body JSON opcional: { only_missing?: boolean }  // default true
// Solo admin_full/admin_op (checkAuth).
// ----------------------------------------------------------------------------

const HOLDED_CONTACTS_BASE = 'https://api.holded.com/api/invoicing/v1/contacts'

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
  try { payload = decodeJwtPayload(token) }
  catch { return { ok: false, status: 401, msg: 'jwt inválido' } }

  const role = String(payload.role ?? '')
  if (role === 'service_role') return { ok: true }
  if (role !== 'authenticated') return { ok: false, status: 403, msg: `rol JWT: ${role}` }

  const sub = String(payload.sub ?? '')
  if (!sub) return { ok: false, status: 403, msg: 'jwt sin sub' }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sub}&select=role`, { headers: dbHeaders })
  if (!res.ok) return { ok: false, status: 500, msg: `profiles ${res.status}` }
  const rows = await res.json() as Array<{ role?: string }>
  const userRole = rows[0]?.role ?? ''
  if (!['admin_full', 'admin_op'].includes(userRole)) {
    return { ok: false, status: 403, msg: 'solo admin puede ejecutar' }
  }
  return { ok: true }
}

interface HoldedContact {
  id: string
  name?: string
  code?: string
  billAddress?: {
    address?: string
    city?: string
    postalCode?: string
    province?: string
    country?: string
  }
  defaultAddress?: {
    address?: string
    city?: string
    postalCode?: string
    province?: string
    country?: string
  }
}

async function fetchContactsPage(page: number): Promise<HoldedContact[]> {
  const url = `${HOLDED_CONTACTS_BASE}?page=${page}`
  const res = await fetch(url, { headers: { key: HOLDED_KEY, accept: 'application/json' } })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`holded /contacts page=${page} ${res.status}: ${txt.slice(0, 200)}`)
  }
  return await res.json() as HoldedContact[]
}

async function pgUpdate(id: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_contactos?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...dbHeaders, prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`patch contacto ${id} ${res.status}: ${txt.slice(0, 200)}`)
  }
}

async function listContactosObjetivo(onlyMissing: boolean): Promise<Set<string>> {
  const url = onlyMissing
    ? `${SUPABASE_URL}/rest/v1/manager_contactos?select=id&or=(direccion.is.null,cp.is.null,poblacion.is.null)`
    : `${SUPABASE_URL}/rest/v1/manager_contactos?select=id`
  const res = await fetch(url, { headers: dbHeaders })
  if (!res.ok) throw new Error(`select contactos ${res.status}`)
  const rows = await res.json() as Array<{ id: string }>
  return new Set(rows.map(r => r.id))
}

function pickAddress(c: HoldedContact): { direccion: string | null; cp: string | null; poblacion: string | null; provincia: string | null; pais: string | null } {
  const a = c.billAddress ?? c.defaultAddress ?? {}
  return {
    direccion: (a.address ?? '').trim() || null,
    cp: (a.postalCode ?? '').trim() || null,
    poblacion: (a.city ?? '').trim() || null,
    provincia: (a.province ?? '').trim() || null,
    pais: (a.country ?? '').trim() || null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return jsonRes({ error: 'POST only' }, 405)

  const auth = await checkAuthAdmin(req)
  if (!auth.ok) return jsonRes({ error: auth.msg }, auth.status)

  if (!HOLDED_KEY) return jsonRes({ error: 'HOLDED_API_KEY no configurada' }, 500)

  let body: { only_missing?: boolean } = {}
  try { body = await req.json() } catch { /* body opcional */ }
  const onlyMissing = body.only_missing !== false  // default true

  let objetivo: Set<string>
  try { objetivo = await listContactosObjetivo(onlyMissing) }
  catch (e) { return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500) }

  if (objetivo.size === 0) return jsonRes({ ok: true, actualizados: 0, motivo: 'sin contactos objetivo' })

  let actualizados = 0
  let recorridos = 0
  const errors: string[] = []

  for (let page = 1; page <= 50; page++) {  // tope seguridad 50 pages × 500 = 25k contactos
    let docs: HoldedContact[]
    try { docs = await fetchContactsPage(page) }
    catch (e) { errors.push(e instanceof Error ? e.message : String(e)); break }
    if (docs.length === 0) break
    recorridos += docs.length

    for (const c of docs) {
      if (!objetivo.has(c.id)) continue
      const addr = pickAddress(c)
      // Si Holded tampoco tiene dirección, marcar geocoded_at fallido para no reintentar.
      const tieneAlgo = addr.direccion || addr.cp || addr.poblacion
      const patch: Record<string, unknown> = {
        direccion: addr.direccion,
        cp: addr.cp,
        poblacion: addr.poblacion,
        provincia: addr.provincia,
        pais: addr.pais,
      }
      if (!tieneAlgo) {
        patch.geocode_provider = 'sin_direccion_holded'
        patch.geocoded_at = new Date().toISOString()
      }
      try { await pgUpdate(c.id, patch); actualizados++ }
      catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }
    }

    if (docs.length < 500) break  // última página
  }

  return jsonRes({ ok: errors.length === 0, recorridos, actualizados, errors: errors.slice(0, 10) })
})
