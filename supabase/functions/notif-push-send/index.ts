// Edge Function: notif-push-send
// ----------------------------------------------------------------------------
// Recibe { notif_id } y manda Web Push a TODAS las subscriptions
// asociadas (vía RPC push_targets_para_notificacion).
//
// Invocado por trigger AFTER INSERT en notificaciones (vía pg_net) o
// manualmente desde el cliente / cron.
// ----------------------------------------------------------------------------

import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') || 'mailto:frutasabocados@gmail.com'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
}

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

function isServiceRequest(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  try {
    const part = token.split('.')[1]
    if (!part) return false
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const pad = (4 - b64.length % 4) % 4
    const payload = JSON.parse(atob(b64 + '='.repeat(pad))) as { role?: string }
    return payload.role === 'service_role'
  } catch { return false }
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

type Notif = {
  id: string
  audience: 'admin' | 'empleado'
  empleado_id: string | null
  tipo: string
  titulo: string
  cuerpo: string | null
  payload: Record<string, unknown>
}

type Target = { endpoint: string; p256dh: string; auth: string; sub_id: string }

async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: dbHeaders, body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`RPC ${name} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return await res.json() as T
}

async function getNotif(id: string): Promise<Notif | null> {
  const url = `${SUPABASE_URL}/rest/v1/notificaciones?id=eq.${id}&select=*&limit=1`
  const res = await fetch(url, { headers: dbHeaders })
  if (!res.ok) return null
  const rows = await res.json() as Notif[]
  return rows[0] ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  if (!isServiceRequest(req)) return json({ error: 'forbidden' }, 403)
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    return json({ error: 'VAPID keys no configuradas' }, 500)
  }

  let body: { notif_id?: string } = {}
  try { body = await req.json() } catch { /* ok */ }
  if (!body.notif_id) return json({ error: 'notif_id requerido' }, 400)

  const notif = await getNotif(body.notif_id)
  if (!notif) return json({ error: 'notif no encontrada' }, 404)

  const targets = await rpc<Target[]>('push_targets_para_notificacion', { p_notif_id: notif.id })

  const payload = JSON.stringify({
    titulo: notif.titulo,
    cuerpo: notif.cuerpo ?? '',
    tipo: notif.tipo,
    tag: `notif-${notif.tipo}`,
    url: '/',
  })

  let enviadas = 0, errores = 0, invalidadas = 0
  for (const t of targets) {
    const sub = { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }
    try {
      await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24 })
      enviadas++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        // Subscription expirada/inválida → borrar
        try { await rpc('push_subscription_delete', { p_endpoint: t.endpoint }); invalidadas++ }
        catch { /* ignore */ }
      } else {
        errores++
        console.error('push send error', status, e)
      }
    }
  }

  return json({ enviadas, errores, invalidadas, total: targets.length })
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...cors, 'content-type': 'application/json' },
  })
}
