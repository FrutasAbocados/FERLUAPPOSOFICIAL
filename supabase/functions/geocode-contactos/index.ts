// Edge Function: geocode-contactos
// Geocodifica direcciones de manager_contactos via Nominatim.
// Body: { force?: boolean, limit?: number, mode?: 'precise' | 'fallback_cp' }
//   mode = 'precise' (default): direccion+cp+poblacion+provincia. Solo lat null y no fallidos.
//   mode = 'fallback_cp': solo cp+poblacion+provincia. Reintenta los marcados como nominatim_fail.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'AbocadosOS/1.0 (https://abocadosos.vercel.app; admin@frutasabocados.com)'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

interface ContactoGeo {
  id: string
  nombre: string | null
  direccion: string | null
  cp: string | null
  poblacion: string | null
  provincia: string | null
  pais: string | null
}

type Mode = 'precise' | 'fallback_cp'

async function listObjetivo(mode: Mode, force: boolean, limit: number): Promise<ContactoGeo[]> {
  const cols = 'select=id,nombre,direccion,cp,poblacion,provincia,pais'
  let url: string
  if (mode === 'fallback_cp') {
    // Reintenta los marcados como nominatim_fail (lat is null) que tengan cp+poblacion.
    url = `${SUPABASE_URL}/rest/v1/manager_contactos?${cols}&cp=not.is.null&poblacion=not.is.null&geocode_provider=eq.nominatim_fail&limit=${limit}`
  } else {
    const baseQ = `${SUPABASE_URL}/rest/v1/manager_contactos?${cols}&direccion=not.is.null&poblacion=not.is.null&limit=${limit}`
    url = force ? baseQ : `${baseQ}&lat=is.null&or=(geocode_provider.is.null,geocode_provider.eq.nominatim_fail)`
  }
  const res = await fetch(url, { headers: dbHeaders })
  if (!res.ok) throw new Error(`select objetivo ${res.status}`)
  return await res.json() as ContactoGeo[]
}

async function pgUpdate(id: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_contactos?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...dbHeaders, prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`patch ${id} ${res.status}: ${txt.slice(0, 200)}`)
  }
}

function buildAddressString(c: ContactoGeo, mode: Mode): string {
  const parts: (string | null)[] = mode === 'fallback_cp'
    ? [c.cp, c.poblacion, c.provincia, c.pais ?? 'ES']
    : [c.direccion, c.cp, c.poblacion, c.provincia, c.pais ?? 'ES']
  return parts.filter((x): x is string => Boolean(x && x.trim())).join(', ')
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  class?: string
  type?: string
  addresstype?: string
}

async function geocodeOne(addr: string): Promise<NominatimResult | null> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=es&addressdetails=0`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, accept: 'application/json' } })
  if (!res.ok) {
    if (res.status === 429) throw new Error('Nominatim rate limited (429)')
    throw new Error(`Nominatim ${res.status}`)
  }
  const arr = await res.json() as NominatimResult[]
  return arr[0] ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return jsonRes({ error: 'POST only' }, 405)

  const auth = await checkAuthAdmin(req)
  if (!auth.ok) return jsonRes({ error: auth.msg }, auth.status)

  let body: { force?: boolean; limit?: number; mode?: Mode } = {}
  try { body = await req.json() } catch { /* opcional */ }
  const force = !!body.force
  const limit = Math.min(Math.max(body.limit ?? 200, 1), 500)
  const mode: Mode = body.mode === 'fallback_cp' ? 'fallback_cp' : 'precise'

  let objetivo: ContactoGeo[]
  try { objetivo = await listObjetivo(mode, force, limit) }
  catch (e) { return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500) }

  if (objetivo.length === 0) return jsonRes({ ok: true, geocodeados: 0, motivo: 'sin objetivos' })

  let ok = 0, fail = 0
  const errors: string[] = []

  for (const c of objetivo) {
    const addr = buildAddressString(c, mode)
    if (!addr) { fail++; continue }

    let result: NominatimResult | null = null
    try { result = await geocodeOne(addr) }
    catch (e) { errors.push(`${c.nombre ?? c.id}: ${e instanceof Error ? e.message : String(e)}`) }

    const now = new Date().toISOString()
    if (result) {
      const provider = mode === 'fallback_cp' ? 'nominatim_cp' : 'nominatim'
      try {
        await pgUpdate(c.id, {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
          geocoded_at: now,
          geocode_provider: provider,
          geocode_address: addr,
          geocode_precision: result.addresstype || result.type || result.class || 'unknown',
        })
        ok++
      } catch (e) { errors.push(`patch ${c.id}: ${e instanceof Error ? e.message : String(e)}`) }
    } else {
      const provider = mode === 'fallback_cp' ? 'nominatim_cp_fail' : 'nominatim_fail'
      try {
        await pgUpdate(c.id, {
          lat: null, lng: null,
          geocoded_at: now,
          geocode_provider: provider,
          geocode_address: addr,
          geocode_precision: null,
        })
        fail++
      } catch (e) { errors.push(`patch fail ${c.id}: ${e instanceof Error ? e.message : String(e)}`) }
    }

    await new Promise(r => setTimeout(r, 1100))
  }

  return jsonRes({ ok: errors.length === 0, mode, total_objetivo: objetivo.length, geocodeados: ok, fallidos: fail, errors: errors.slice(0, 10) })
})
