// Edge Function: fix-holded-contact-names
// ONE-SHOT — restaura los nombres fiscales legales de 14 contactos Holded
// que fueron sobreescritos por versiones anteriores de pedido-a-holded
// que enviaban contactName junto con contactId.
//
// Auth: service_role o admin_full
// Body: {} (sin parámetros — actualiza los 14 contactos hardcodeados)
// Responde: { results: [{id, name, ok, status, error?}] }

const HOLDED_KEY = Deno.env.get('HOLDED_API_KEY') || ''
const HOLDED_CONTACTS_URL = 'https://api.holded.com/api/contacts/v2/contacts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

async function checkAuth(req: Request): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, msg: 'falta Authorization' }
  let payload: Record<string, unknown>
  try { payload = decodeJwtPayload(token) } catch { return { ok: false, status: 401, msg: 'jwt inválido' } }
  const role = String(payload.role ?? '')
  if (role === 'service_role') return { ok: true }
  if (role !== 'authenticated') return { ok: false, status: 403, msg: `rol no permitido: ${role}` }
  const sub = String(payload.sub ?? '')
  if (!sub) return { ok: false, status: 403, msg: 'jwt sin sub' }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sub}&select=role`, {
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) return { ok: false, status: 500, msg: `profiles ${res.status}` }
  const rows = await res.json() as Array<{ role?: string }>
  if (rows[0]?.role !== 'admin_full') return { ok: false, status: 403, msg: 'solo admin_full' }
  return { ok: true }
}

// Mapa holded_contact_id → nombre fiscal legal correcto
// Obtenido de manager_contactos (sincronizado desde Holded antes de la sobreescritura)
const CONTACT_NAME_FIXES: { id: string; name: string }[] = [
  { id: '69e522c3e40f926fd308978c', name: 'JEREMY MATTHEW ENCINA JONES (REST. AZURA)' },
  { id: '68f149afe11b5b116f045f8e', name: 'JORGE MOYA RUEDA (REPIPI)' },
  { id: '6924deadd3401aefc00c7999', name: 'LANTSOGHT SCHNABEL ROBERT JEAN PAUL (CASA ROBERTO)' },
  { id: '68eff3c61f29bd7f9701b65c', name: 'María Teresa Gómez Donjo (Casi Casi Bar)' },
  { id: '6984f12e9385e80fec068768', name: 'BODEGA RESTAURANTE CHAROLAIS SL' },
  { id: '696d3191060a49f9480f174b', name: 'LA GALLETA ROSA S.L. (DAK BURGUER)' },
  { id: '696aaf1fe80236498d07b875', name: 'COURTNEY JADE HALL (DON SANTIAGO)' },
  { id: '69820ae316d96c91590a9ff1', name: 'GELAEL ARENAS S.L(BAR HOLLYWOOD)' },
  { id: '69c0316f326503fc2c0b9ef6', name: 'SABORES DE MEXICO RESTAURANTE SL (ITACATE)' },
  { id: '691240ef07f976d605091497', name: 'LA ROZUELA LOS PACOS SL' },
  { id: '697683e40a5693afe8094e01', name: 'ALMA FUENGIROLA SL' },
  { id: '695ff954b5a7c4a6a30d55b0', name: 'MARYAM RAHSHENAS (PIZZERIA SORRENTO)' },
  { id: '68dda387da754ffebe0ec132', name: 'Victor Vinilo King SLU (Cocktail)' },
  { id: '69768344564c7841bc04e386', name: 'YOLE EUROPE S.L' },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = await checkAuth(req)
  if (!auth.ok) return jsonRes({ error: auth.msg }, auth.status)
  if (!HOLDED_KEY) return jsonRes({ error: 'HOLDED_API_KEY no configurada' }, 500)

  const results: { id: string; name: string; ok: boolean; status: number; error?: string }[] = []

  for (const contact of CONTACT_NAME_FIXES) {
    let status = 0
    let ok = false
    let error: string | undefined

    try {
      const res = await fetch(`${HOLDED_CONTACTS_URL}/${contact.id}`, {
        method: 'PUT',
        headers: {
          key: HOLDED_KEY,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: contact.name }),
      })
      status = res.status
      ok = res.ok
      if (!res.ok) {
        error = (await res.text()).slice(0, 200)
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }

    results.push({ id: contact.id, name: contact.name, ok, status, ...(error ? { error } : {}) })

    // Rate limit: Holded permite 500 req/respuesta pero siendo conservadores
    await new Promise(r => setTimeout(r, 200))
  }

  const allOk = results.every(r => r.ok)
  return jsonRes({ ok: allOk, total: results.length, fixed: results.filter(r => r.ok).length, results })
})
