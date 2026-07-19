// Edge Function: pedidos-esperados-push
// Cron diario 08:00 UTC. Llama manager_pedidos_proximos() y emite notif admin.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SENTRY_DSN   = Deno.env.get('SENTRY_EDGE_DSN') ?? ''

const dbHeaders = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' }
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey',
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

function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { ...cors, 'content-type': 'application/json' } })
}

async function reportEdgeError(error: unknown, context: { fn: string; extra?: Record<string, unknown> } = { fn: 'unknown' }): Promise<void> {
  if (!SENTRY_DSN) return
  const m = SENTRY_DSN.match(/^(https?):\/\/([^@]+)@([^/]+)\/(\d+)$/)
  if (!m) return
  const [, protocol, publicKey, host, projectId] = m
  const message = error instanceof Error ? error.message : String(error)
  const eventId = crypto.randomUUID().replace(/-/g, '')
  const now = new Date().toISOString()
  const event = {
    event_id: eventId, timestamp: now, platform: 'javascript', level: 'error',
    server_name: context.fn,
    environment: Deno.env.get('SENTRY_ENV') ?? 'production',
    tags: { runtime: 'deno-edge', function: context.fn },
    extra: context.extra ?? {},
    exception: { values: [{ type: error instanceof Error ? error.name : 'Error', value: message }] },
  }
  const body = `${JSON.stringify({ event_id: eventId, sent_at: now, dsn: SENTRY_DSN })}\n${JSON.stringify({ type: 'event', length: 0 })}\n${JSON.stringify(event)}\n`
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

async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: dbHeaders, body: JSON.stringify(args) })
    if (!res.ok) { console.error(`RPC ${name} ${res.status}: ${(await res.text()).slice(0, 200)}`); return null }
    return await res.json() as T
  } catch (e) { console.error(`RPC ${name}:`, e); return null }
}

interface PedidoEsperado {
  contact_name_canon: string
  ultima_compra: string
  cadencia_dias: number
  proxima_esperada: string
  dias_para: number
  ventas_medias: number
  prioridad: 'urgente' | 'pronto' | 'esta_semana'
  ticket_medio?: number
  pedidos_90d?: number
}

async function existeNotifHoy(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10)
  const url = `${SUPABASE_URL}/rest/v1/notificaciones?audience=eq.admin&tipo=eq.pedidos_esperados&created_at=gte.${today}T00:00:00Z&select=id&limit=1`
  const res = await fetch(url, { headers: dbHeaders })
  if (!res.ok) return false
  const rows = await res.json() as unknown[]
  return rows.length > 0
}

function fmtEur(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K€`
  return `${Math.round(v)}€`
}

function construirMensaje(pedidos: PedidoEsperado[]): { titulo: string; cuerpo: string } {
  const urgentes = pedidos.filter((p) => p.prioridad === 'urgente')
  const pronto = pedidos.filter((p) => p.prioridad === 'pronto')
  const total = urgentes.length + pronto.length
  const valorTotal = pedidos.reduce((s, p) => s + (p.ticket_medio ?? p.ventas_medias ?? 0), 0)
  const titulo = `📞 ${total} clientes que toca llamar`
  const lineas: string[] = []
  if (urgentes.length > 0) {
    const top = urgentes.slice(0, 3).map((p) => p.contact_name_canon)
    lineas.push(`🔴 Urgente (ya tarde): ${top.join(', ')}${urgentes.length > 3 ? `… +${urgentes.length - 3}` : ''}`)
  }
  if (pronto.length > 0) {
    const top = pronto.slice(0, 3).map((p) => p.contact_name_canon)
    lineas.push(`🟡 Pronto (hoy/mañana): ${top.join(', ')}${pronto.length > 3 ? `… +${pronto.length - 3}` : ''}`)
  }
  lineas.push(`Valor estimado: ${fmtEur(valorTotal)}.`)
  return { titulo, cuerpo: lineas.join(' · ').slice(0, 280) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return jsonRes({ error: 'POST only' }, 405)
  if (!isServiceRequest(req)) return jsonRes({ error: 'forbidden' }, 403)

  let body: { force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const force = !!body.force

  try {
    if (!force && await existeNotifHoy()) {
      return jsonRes({ ok: true, omitida: true, motivo: 'ya emitida hoy' })
    }
    const pedidos = await rpc<PedidoEsperado[]>('manager_pedidos_proximos')
    if (!pedidos) return jsonRes({ ok: false, error: 'RPC manager_pedidos_proximos falló' }, 500)
    const accionables = pedidos.filter((p) => p.prioridad === 'urgente' || p.prioridad === 'pronto')
    if (accionables.length === 0) {
      return jsonRes({ ok: true, omitida: true, motivo: 'sin pedidos accionables hoy' })
    }
    const { titulo, cuerpo } = construirMensaje(accionables)
    const ok = await rpc('notif_emit', {
      p_audience: 'admin', p_empleado_id: null, p_tipo: 'pedidos_esperados',
      p_titulo: titulo, p_cuerpo: cuerpo,
      p_payload: {
        clientes: accionables.slice(0, 10).map((p) => ({
          nombre: p.contact_name_canon, prioridad: p.prioridad,
          dias_para: p.dias_para, ticket_medio: p.ticket_medio ?? p.ventas_medias,
        })),
        total: accionables.length,
      },
    })
    return jsonRes({
      ok: !!ok, total: accionables.length,
      urgentes: accionables.filter((p) => p.prioridad === 'urgente').length,
      pronto: accionables.filter((p) => p.prioridad === 'pronto').length,
      titulo,
    })
  } catch (e) {
    await reportEdgeError(e, { fn: 'pedidos-esperados-push' })
    return jsonRes({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
