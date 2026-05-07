// Edge Function: cobros-backup-diario
// ----------------------------------------------------------------------------
// Genera un snapshot JSON del módulo Cobros y lo sube al bucket privado
// `cobros-backups`. Registra el resultado en `cobros_backups_log`.
//
// Disparable por:
//   - Cron pg_cron diario (Authorization: Bearer service_role).
//   - Manual desde admin (Authorization: Bearer JWT con role admin_full/admin_op).
//
// Body opcional: { trigger?: string }
// ----------------------------------------------------------------------------

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

async function checkAuth(req: Request): Promise<{ ok: true; isService: boolean } | { ok: false; status: number; msg: string }> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, msg: 'falta Authorization' }
  let payload: Record<string, unknown>
  try { payload = decodeJwtPayload(token) } catch { return { ok: false, status: 401, msg: 'jwt inválido' } }
  const role = String(payload.role ?? '')
  if (role === 'service_role') return { ok: true, isService: true }
  if (role !== 'authenticated') return { ok: false, status: 403, msg: `rol JWT: ${role}` }
  const sub = String(payload.sub ?? '')
  if (!sub) return { ok: false, status: 403, msg: 'jwt sin sub' }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sub}&select=role`, { headers: dbHeaders })
  if (!res.ok) return { ok: false, status: 500, msg: `profiles ${res.status}` }
  const rows = await res.json() as Array<{ role?: string }>
  const userRole = rows[0]?.role ?? ''
  if (!['admin_full', 'admin_op'].includes(userRole)) return { ok: false, status: 403, msg: 'solo admin' }
  return { ok: true, isService: false }
}

async function pgSelectAll(path: string): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: dbHeaders })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`select ${path} ${res.status}: ${txt.slice(0, 200)}`)
  }
  return await res.json() as unknown[]
}

async function pgInsert(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...dbHeaders, prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`insert ${path} ${res.status}: ${txt.slice(0, 200)}`)
  }
}

async function uploadStorage(bucketPath: string, content: string): Promise<{ size: number }> {
  const url = `${SUPABASE_URL}/storage/v1/object/cobros-backups/${bucketPath}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body: content,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`storage upload ${res.status}: ${txt.slice(0, 200)}`)
  }
  return { size: new TextEncoder().encode(content).length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return jsonRes({ error: 'POST only' }, 405)

  const auth = await checkAuth(req)
  if (!auth.ok) return jsonRes({ error: auth.msg }, auth.status)

  let body: { trigger?: string } = {}
  try { body = await req.json() } catch { /* opcional */ }
  const triggerSource = (body.trigger ?? (auth.isService ? 'cron' : 'manual')).slice(0, 20)

  const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD UTC
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const storagePath = `${today.slice(0, 4)}/${today.slice(5, 7)}/${ts}.json`

  try {
    // 1) Pull data
    const [clientes, movimientos] = await Promise.all([
      pgSelectAll('cobros_clientes?select=*'),
      pgSelectAll('cobros_movimientos?select=*'),
    ])

    const payload = {
      generated_at: new Date().toISOString(),
      trigger: triggerSource,
      version: 1,
      counts: { clientes: clientes.length, movimientos: movimientos.length },
      clientes,
      movimientos,
    }

    const json = JSON.stringify(payload)
    const { size } = await uploadStorage(storagePath, json)

    // 2) Log success
    await pgInsert('cobros_backups_log', {
      fecha: today,
      storage_path: storagePath,
      size_bytes: size,
      num_clientes: clientes.length,
      num_movimientos: movimientos.length,
      ok: true,
      trigger_source: triggerSource,
    })

    return jsonRes({
      ok: true,
      storage_path: storagePath,
      size_bytes: size,
      num_clientes: clientes.length,
      num_movimientos: movimientos.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Log failure (best effort)
    try {
      await pgInsert('cobros_backups_log', {
        fecha: today,
        storage_path: storagePath,
        ok: false,
        error_msg: msg.slice(0, 500),
        trigger_source: triggerSource,
      })
    } catch { /* ignore */ }
    return jsonRes({ ok: false, error: msg }, 500)
  }
})
