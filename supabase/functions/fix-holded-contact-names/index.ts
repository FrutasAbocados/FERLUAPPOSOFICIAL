// Edge Function: fix-holded-contact-names
// ONE-SHOT — restaura los nombres fiscales de todos los contactos vinculados.
// URL correcta: /api/invoicing/v1/contacts (verificado en holded-sync-contactos)
//
// Auth: service_role o admin_full
// Body: {} — actualiza todos los contactos de la lista
// Responde: { ok, total, fixed, results }

const HOLDED_KEY = Deno.env.get('HOLDED_API_KEY') || ''
const HOLDED_CONTACTS_BASE = 'https://api.holded.com/api/invoicing/v1/contacts'

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

// holded_contact_id → nombre fiscal legal correcto (de manager_contactos)
// 30 clientes vinculados en pedidos_wa_clientes × manager_contactos
const CONTACT_NAME_FIXES: { id: string; cliente: string; name: string }[] = [
  { id: '69e522c3e40f926fd308978c', cliente: 'AZURA',               name: 'JEREMY MATTHEW ENCINA JONES (REST. AZURA)' },
  { id: '69d694779b2ff2ab940a7b0b', cliente: 'BAR BETIS',           name: 'JUAN PEDRO MARTINEZ GARCIA (BAR BETIS)' },
  { id: '68f149afe11b5b116f045f8e', cliente: 'BAR REPIPI',          name: 'JORGE MOYA RUEDA (REPIPI)' },
  { id: '67b7478f421b38140f08bc94', cliente: 'BERIGÚ',              name: 'NICOLÁS SILVIO FERRARO CIOFFI' },
  { id: '6721f22c51059510e50f0d59', cliente: 'BLACKBERRY',          name: 'Zumoart S.L' },
  { id: '6707aa3807dd1a42350a4b9c', cliente: 'CASA DIEGO',          name: 'Freiduría Casa Diego SL' },
  { id: '6914e98eb2125c4e6009fc7c', cliente: 'CASA PACO',           name: 'FRANCISCO CASCADO RAMOS E HIJOS SL (CASA PACO )' },
  { id: '6924deadd3401aefc00c7999', cliente: 'CASA ROBERTO',        name: 'LANTSOGHT SCHNABEL ROBERT JEAN PAUL (CASA ROBERTO)' },
  { id: '68eff3c61f29bd7f9701b65c', cliente: 'CASI CASI CAFETERÍA', name: 'María Teresa Gómez Donjo (Casi Casi Bar)' },
  { id: '6984f12e9385e80fec068768', cliente: 'CHAROLAIS',           name: 'BODEGA RESTAURANTE CHAROLAIS SL' },
  { id: '682ea919f9abfab372092d05', cliente: 'CHIRINGUITO LOS MORENOS', name: 'CHIRINGUITO LOS MORENOS S.L' },
  { id: '69680a72b154a28b280a8ee5', cliente: 'CLUB NAUTICO',        name: 'JORGE LUIS GOMEZ TRUJILLO (Club Nautico)' },
  { id: '69d81281a8e0de6820098b5c', cliente: 'COLINA DEL FARO',    name: 'GRUPO TIZISA SL (LAS COLINAS DEL FARO)' },
  { id: '696d3191060a49f9480f174b', cliente: 'DAK BURGUER',         name: 'LA GALLETA ROSA S.L. (DAK BURGUER)' },
  { id: '696aaf1fe80236498d07b875', cliente: 'DON SANTIAGO',        name: 'COURTNEY JADE HALL (DON SANTIAGO)' },
  { id: '683d21caca00f2c4a7084a2b', cliente: 'EL ABUELO',          name: 'RESTAURANTE EL ABUELO' },
  { id: '69820ae316d96c91590a9ff1', cliente: 'HOLLYWOOD',           name: 'GELAEL ARENAS S.L(BAR HOLLYWOOD)' },
  { id: '69c0316f326503fc2c0b9ef6', cliente: 'ITACATE',             name: 'SABORES DE MEXICO RESTAURANTE SL (ITACATE)' },
  { id: '690e792b4d0e5a0c830ec8e0', cliente: 'LA CATEDRAL',        name: 'CANTON RUBIO SALVIO (La catedral)' },
  { id: '680a76e976789c9a99019ce5', cliente: 'LA PAERETA',          name: 'Hostelería Peinado SL (Pizzeria La Paereta)' },
  { id: '691240ef07f976d605091497', cliente: 'LA ROZUELA',          name: 'LA ROZUELA LOS PACOS SL' },
  { id: '697896bd79f670b6b80861ef', cliente: 'LOS BROCALES',        name: 'RESTAURANTE LOS BROCALES S.L.' },
  { id: '697683e40a5693afe8094e01', cliente: 'RESTAURANTE ALMA',    name: 'ALMA FUENGIROLA SL' },
  { id: '6962040f9706b6336309aa94', cliente: 'RESTAURANTE EL GOLF', name: 'Costa Social Wellness S.L (Restaurante El Golf)' },
  { id: '68ba0058115fd3cd180db2cb', cliente: 'RICHYS FOOD',         name: 'Richy´s Food (RICHY´S FOOD)' },
  { id: '695ff954b5a7c4a6a30d55b0', cliente: 'SORRENTO',            name: 'MARYAM RAHSHENAS (PIZZERIA SORRENTO)' },
  { id: '6874bcf38f9a7104e1081b74', cliente: 'VERDIALES',           name: 'Restaurante Verdiales (Torres y Hevilla S.L)' },
  { id: '6887e9431a61c4357503462f', cliente: 'VICTOR BEACH',        name: 'Victor Vinilo King SLU (Victor Beach)' },
  { id: '68dda387da754ffebe0ec132', cliente: 'VICTOR COCKTAIL',     name: 'Victor Vinilo King SLU (Cocktail)' },
  { id: '69768344564c7841bc04e386', cliente: 'YOLE HELADERIA',      name: 'YOLE EUROPE S.L' },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = await checkAuth(req)
  if (!auth.ok) return jsonRes({ error: auth.msg }, auth.status)
  if (!HOLDED_KEY) return jsonRes({ error: 'HOLDED_API_KEY no configurada' }, 500)

  const results: { id: string; cliente: string; name: string; ok: boolean; status: number; body?: unknown; error?: string }[] = []

  for (const contact of CONTACT_NAME_FIXES) {
    let status = 0
    let ok = false
    let error: string | undefined
    let body: unknown

    try {
      const res = await fetch(`${HOLDED_CONTACTS_BASE}/${contact.id}`, {
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
      const txt = await res.text()
      try { body = JSON.parse(txt) } catch { body = txt.slice(0, 300) }
      if (!res.ok) error = typeof body === 'string' ? body : JSON.stringify(body).slice(0, 200)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }

    results.push({ id: contact.id, cliente: contact.cliente, name: contact.name, ok, status, body, ...(error ? { error } : {}) })
    await new Promise(r => setTimeout(r, 150))
  }

  const allOk = results.every(r => r.ok)
  return jsonRes({ ok: allOk, total: results.length, fixed: results.filter(r => r.ok).length, results })
})
