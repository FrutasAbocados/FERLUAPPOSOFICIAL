// Edge Function: holded-sync-contactos
// ----------------------------------------------------------------------------
// Sincroniza contactos desde Holded a manager_contactos.
// El sync principal (holded-sync) solo guarda id+nombre de contactos que
// aparecen en documentos (facturas/compras). Esta edge llama /contacts paginado
// y (a) INSERTA contactos nuevos que aún no existen en la tabla —incluidos los
// que no tienen ningún documento todavía— con id + nombre + NIF + dirección, y
// (b) completa NIF/dirección de los ya existentes sin pisar correcciones locales.
//
// Body JSON opcional: { only_missing?: boolean }  // default true (solo completa
//   campos vacíos de contactos EXISTENTES; los nuevos siempre se insertan).
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

interface DbContact {
  id: string
  nif: string | null
  direccion: string | null
  cp: string | null
  poblacion: string | null
  provincia: string | null
  pais: string | null
  geocode_provider: string | null
  geocoded_at: string | null
}

type ContactAddress = Pick<DbContact, 'direccion' | 'cp' | 'poblacion' | 'provincia' | 'pais'>

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

async function pgInsert(row: Record<string, unknown>): Promise<void> {
  // Upsert idempotente por id (merge-duplicates evita conflicto si el sync
  // horario insertó el contacto en paralelo).
  const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_contactos`, {
    method: 'POST',
    headers: { ...dbHeaders, prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`insert contacto ${row.id} ${res.status}: ${txt.slice(0, 200)}`)
  }
}

// Todos los contactos existentes y sus campos fiscales. Además de detectar
// contactos nuevos, permite completar solo huecos sin borrar correcciones locales.
async function listContactosExistentes(): Promise<Map<string, DbContact>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/manager_contactos?select=id,nif,direccion,cp,poblacion,provincia,pais,geocode_provider,geocoded_at`,
    { headers: dbHeaders },
  )
  if (!res.ok) throw new Error(`select existentes ${res.status}`)
  const rows = await res.json() as DbContact[]
  return new Map(rows.map(r => [r.id, r]))
}

function clean(value: string | null | undefined): string | null {
  return (value ?? '').trim() || null
}

function pickAddress(c: HoldedContact): ContactAddress {
  const a = c.billAddress ?? c.defaultAddress ?? {}
  return {
    direccion: clean(a.address),
    cp: clean(a.postalCode),
    poblacion: clean(a.city),
    provincia: clean(a.province),
    pais: clean(a.country),
  }
}

function buildExistingPatch(
  existente: DbContact,
  holdedNif: string | null,
  addr: ContactAddress,
  onlyMissing: boolean,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  // Nunca borrar ni sobrescribir un NIF local: puede contener una corrección
  // fiscal manual más fiable que el dato importado.
  if (holdedNif && !clean(existente.nif)) patch.nif = holdedNif

  for (const key of ['direccion', 'cp', 'poblacion', 'provincia', 'pais'] as const) {
    if (onlyMissing) {
      if (!clean(existente[key]) && addr[key]) patch[key] = addr[key]
    } else {
      patch[key] = addr[key]
    }
  }

  return patch
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

  let existentes: Map<string, DbContact>
  try {
    existentes = await listContactosExistentes()
  }
  catch (e) { return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500) }

  let actualizados = 0
  let insertados = 0
  let recorridos = 0
  let nifActualizados = 0
  let contactosHoldedConNif = 0
  let sinCambios = 0
  const errors: string[] = []

  for (let page = 1; page <= 50; page++) {  // tope seguridad 50 pages × 500 = 25k contactos
    let docs: HoldedContact[]
    try { docs = await fetchContactsPage(page) }
    catch (e) { errors.push(e instanceof Error ? e.message : String(e)); break }
    if (docs.length === 0) break
    recorridos += docs.length

    for (const c of docs) {
      const addr = pickAddress(c)
      const holdedNif = clean(c.code)
      const tieneAlgo = addr.direccion || addr.cp || addr.poblacion
      if (holdedNif) contactosHoldedConNif++

      // Contacto NUEVO: no existe en la tabla → insertar con id + nombre + NIF + dirección.
      const existente = existentes.get(c.id)
      if (!existente) {
        const nombre = (c.name ?? '').trim()
        if (!nombre) continue  // sin nombre no sirve para el buscador
        const row: Record<string, unknown> = {
          id: c.id,
          nombre,
          nif: holdedNif,
          direccion: addr.direccion,
          cp: addr.cp,
          poblacion: addr.poblacion,
          provincia: addr.provincia,
          pais: addr.pais,
        }
        if (!tieneAlgo) {
          row.geocode_provider = 'sin_direccion_holded'
          row.geocoded_at = new Date().toISOString()
        }
        try {
          await pgInsert(row)
          insertados++
          if (holdedNif) nifActualizados++
          existentes.set(c.id, {
            id: c.id,
            nif: holdedNif,
            ...addr,
            geocode_provider: tieneAlgo ? null : 'sin_direccion_holded',
            geocoded_at: tieneAlgo ? null : new Date().toISOString(),
          })
        }
        catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }
        continue
      }

      // Contacto EXISTENTE: completar huecos por defecto; el refresco explícito
      // (only_missing=false) conserva el comportamiento anterior para dirección.
      const patch = buildExistingPatch(existente, holdedNif, addr, onlyMissing)
      if (
        !tieneAlgo
        && !clean(existente.direccion)
        && existente.geocode_provider !== 'sin_direccion_holded'
      ) {
        patch.geocode_provider = 'sin_direccion_holded'
        patch.geocoded_at = new Date().toISOString()
      }
      if (Object.keys(patch).length === 0) {
        sinCambios++
        continue
      }
      try {
        await pgUpdate(c.id, patch)
        actualizados++
        if ('nif' in patch) nifActualizados++
      }
      catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }
    }

    if (docs.length < 500) break  // última página
  }

  return jsonRes({
    ok: errors.length === 0,
    recorridos,
    contactos_holded_con_nif: contactosHoldedConNif,
    insertados,
    actualizados,
    nif_actualizados: nifActualizados,
    sin_cambios: sinCambios,
    errors: errors.slice(0, 10),
  })
})
