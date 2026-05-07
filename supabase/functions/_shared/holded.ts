// Boilerplate compartido por las edges que hablan con Holded (pedido-a-holded,
// compra-a-holded, borrar-borrador-holded).
//
// Centraliza: env vars, headers DB/CORS, decode JWT, checkAuth con allowlist
// de roles, helper jsonRes. Reduce el riesgo de que una rotación de API key se
// aplique a 2 de 3 edges en lugar de a las 3.

export const HOLDED_BASE = 'https://api.holded.com/api/invoicing/v1/documents'

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
export const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
export const HOLDED_KEY   = Deno.env.get('HOLDED_API_KEY') || ''

export const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { ...cors, 'content-type': 'application/json' },
  })
}

/** Holded espera Unix segundos. Usamos 12:00 UTC del día — Holded re-formatea con timezone usuario. */
export function fechaToUnixMadrid(fechaIso: string): number {
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

export type AppRole = 'admin_full' | 'admin_op' | 'responsable' | 'empleado'

export type AuthOk = { ok: true }
export type AuthFail = { ok: false; status: number; msg: string }
export type AuthResult = AuthOk | AuthFail

/**
 * Valida JWT y rol del usuario.
 * - service_role siempre permitido.
 * - anon permitido (trigger pg_net invoca con anon key) — por eso opt-in con `allowAnon`.
 * - authenticated: chequea el rol en `profiles` contra `allowedRoles`.
 */
export async function checkAuth(
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
    return {
      ok: false,
      status: 403,
      msg: `solo ${options.allowedRoles.join('|')} pueden ejecutar esta operación`,
    }
  }
  return { ok: true }
}
