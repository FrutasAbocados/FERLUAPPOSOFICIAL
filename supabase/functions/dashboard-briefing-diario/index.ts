// Edge Function: dashboard-briefing-diario
// ----------------------------------------------------------------------------
// Genera un briefing Markdown del estado del negocio para el Dashboard.
// Cron diario 07:30 UTC (después de notificaciones-ia que va 07:00).
// Body opcional: { fecha?: 'YYYY-MM-DD' }
// Devuelve: { ok, contenido_md, resumen_corto, fecha, modelo, tokens_in, tokens_out }
// ----------------------------------------------------------------------------

// Helper Sentry inline (no-op si SENTRY_EDGE_DSN vacío). Inlineado porque el
// deploy del MCP no resuelve imports a `_shared/`.
const SENTRY_DSN_BRIEFING = Deno.env.get('SENTRY_EDGE_DSN') ?? ''
async function reportEdgeError(error: unknown, context: { fn: string; extra?: Record<string, unknown> } = { fn: 'unknown' }): Promise<void> {
  if (!SENTRY_DSN_BRIEFING) return
  const m = SENTRY_DSN_BRIEFING.match(/^(https?):\/\/([^@]+)@([^/]+)\/(\d+)$/)
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
  const body = `${JSON.stringify({ event_id: eventId, sent_at: now, dsn: SENTRY_DSN_BRIEFING })}\n${JSON.stringify({ type: 'event', length: 0 })}\n${JSON.stringify(event)}\n`
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

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const MODEL         = Deno.env.get('BRIEFING_MODEL') || 'claude-haiku-4-5-20251001'
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey',
}

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
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

async function checkAuth(req: Request): Promise<{ ok: true; isService: boolean; userId?: string } | { ok: false; status: number; msg: string }> {
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
  return { ok: true, isService: false, userId: sub }
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: dbHeaders, body: JSON.stringify(args),
    })
    if (!res.ok) return null
    return await res.json() as T
  } catch { return null }
}

interface KpisHoy {
  ventas_hoy?: number
  compras_hoy?: number
  docs_hoy?: number
  pendiente_albaranes?: number
}

interface Deudor {
  cliente_id?: string
  cliente_nombre?: string
  vencido?: number
  total?: number
}

interface CosteSubiendo {
  nombre?: string
  variacion_pct?: number
  coste_actual?: number
}

interface ClienteRiesgo {
  contact_name?: string
  ultima_compra?: string
  motivos?: string[]
}

interface PedidoEsperado {
  contact_name_canon?: string
  dias_para?: number
  prioridad?: string
}

function n(v: unknown): number {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}

function eur(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K€`
  return `${Math.round(v)}€`
}

async function recopilarSenales() {
  const [kpis, deudores, costesSub, riesgos, pedidos] = await Promise.all([
    rpc<KpisHoy[]>('dashboard_kpis_hoy'),
    rpc<Deudor[]>('dashboard_top_deudores'),
    rpc<CosteSubiendo[]>('dashboard_costes_subiendo', { p_dias: 14, p_pct_min: 15 }),
    rpc<ClienteRiesgo[]>('dashboard_clientes_riesgo_fuga'),
    rpc<PedidoEsperado[]>('manager_pedidos_proximos'),
  ])

  const kpi = (kpis ?? [])[0] ?? {}
  const top3Deudores = (deudores ?? []).slice(0, 3)
  const top3Costes = (costesSub ?? []).slice(0, 3)
  const top3Riesgo = (riesgos ?? []).slice(0, 3)
  const pedidosHoyTarde = (pedidos ?? []).filter(p => p.prioridad === 'hoy' || p.prioridad === 'tarde')

  return { kpi, top3Deudores, top3Costes, top3Riesgo, pedidosHoyTarde }
}

function construirPrompt(s: ReturnType<typeof recopilarSenales> extends Promise<infer R> ? R : never): { system: string; user: string } {
  const ventasHoy = n(s.kpi.ventas_hoy)
  const comprasHoy = n(s.kpi.compras_hoy)
  const docsHoy = n(s.kpi.docs_hoy)
  const pendienteAlb = n(s.kpi.pendiente_albaranes)

  const deudoresStr = s.top3Deudores.length > 0
    ? s.top3Deudores.map((d) => `- ${d.cliente_nombre ?? '?'}: ${eur(n(d.vencido))} vencido`).join('\n')
    : '- Sin deuda crítica'

  const costesStr = s.top3Costes.length > 0
    ? s.top3Costes.map((c) => `- ${c.nombre ?? '?'}: +${Math.round(n(c.variacion_pct))}% (ahora ${n(c.coste_actual).toFixed(2)}€/ud)`).join('\n')
    : '- Sin subidas relevantes'

  const riesgoStr = s.top3Riesgo.length > 0
    ? s.top3Riesgo.map((r) => {
        const motivos = (r.motivos ?? []).slice(0, 2).join(', ')
        return `- ${r.contact_name ?? '?'} (${motivos || 'sin compras recientes'})`
      }).join('\n')
    : '- Nadie'

  const pedidosStr = s.pedidosHoyTarde.length > 0
    ? s.pedidosHoyTarde.slice(0, 3).map((p) => `- ${p.contact_name_canon ?? '?'} (${p.dias_para ?? 0}d)`).join('\n')
    : '- Sin pedidos esperados pendientes'

  const system = `Eres el copiloto de Frutas Abocados (mayorista frutas/verduras Málaga, 5 empleados, socios Luis y Álvaro). Tu trabajo es leer el estado del día y darle a Luis un BRIEFING corto, español de la calle, sin paja corporativa. Trato de tú.

REGLAS:
- Devuelve SOLO Markdown. NO incluyas \`\`\`md ni preámbulos.
- 4-6 frases máximo. Cada frase = 1 idea accionable.
- Empieza con cifra de ventas hoy en negrita y comparación cualitativa si tienes señal ("buen ritmo", "flojo", "tirón fuerte").
- Después: 1 alerta de cobro, 1 alerta de coste, 1 alerta de riesgo de cliente o pedido esperado, en este orden y solo si los datos lo justifican.
- NO inventes datos. Si una sección no tiene señales relevantes, sáltala.
- Sé específico con nombres concretos (cliente o producto), nunca abstracto.
- Termina con UNA línea de "resumen" en cursiva con el take-away del día (1 frase).

EJEMPLO de salida (NO copies, solo es referencia de tono):
**1.250€ vendidos hoy**, ritmo flojo de un viernes. Casa Roberto sigue debiendo 6.357€ desde marzo, hora de llamar. La manzana ha subido un 22% esta semana, considera ajustar PVP. Tres clientes top esta semana sin asomar la cabeza: BAR REPIPI, BERIGÚ, RICHYS. *Día para apretar cobros y revisar tarifa fruta de pepita.*`

  const user = `Datos de hoy (${new Date().toISOString().slice(0, 10)}):

KPIs hoy:
- Ventas: ${eur(ventasHoy)}
- Compras: ${eur(comprasHoy)}
- Docs: ${docsHoy}
- Pendiente albaranes: ${eur(pendienteAlb)}

Top deudores:
${deudoresStr}

Costes subiendo (>15% últimos 14d):
${costesStr}

Clientes en riesgo de fuga:
${riesgoStr}

Pedidos esperados hoy/tarde:
${pedidosStr}

Genera el briefing en Markdown según las reglas.`

  return { system, user }
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
  model?: string
}

async function generarBriefing(system: string, user: string): Promise<{ contenido: string; tokensIn: number; tokensOut: number; modelo: string } | null> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    console.error('Anthropic error', res.status, await res.text().catch(() => ''))
    return null
  }
  const json = await res.json() as AnthropicResponse
  const texto = (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim()
  if (!texto) return null
  return {
    contenido: texto,
    tokensIn: json.usage?.input_tokens ?? 0,
    tokensOut: json.usage?.output_tokens ?? 0,
    modelo: json.model ?? MODEL,
  }
}

async function insertarBriefing(row: {
  fecha: string
  contenido_md: string
  resumen_corto: string | null
  modelo: string
  tokens_in: number
  tokens_out: number
  coste_eur: number | null
  fuente: 'cron' | 'manual'
  generated_by: string | null
}): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_briefing_diario`, {
    method: 'POST',
    headers: { ...dbHeaders, prefer: 'return=minimal' },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`insert ${res.status}: ${txt.slice(0, 200)}`)
  }
}

function extraerResumenCorto(md: string): string {
  // Toma la primera oración del Markdown, sin formato
  const limpio = md.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').replace(/\n+/g, ' ').trim()
  const primera = limpio.split(/\.\s+/)[0]
  return primera.slice(0, 180) + (primera.length > 180 ? '…' : '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return jsonRes({ error: 'POST only' }, 405)

  if (!ANTHROPIC_KEY) return jsonRes({ error: 'ANTHROPIC_API_KEY no configurada' }, 500)

  const auth = await checkAuth(req)
  if (!auth.ok) return jsonRes({ error: auth.msg }, auth.status)

  let body: { fecha?: string } = {}
  try { body = await req.json() } catch { /* opcional */ }
  const fecha = body.fecha || new Date().toISOString().slice(0, 10)

  try {
    const senales = await recopilarSenales()
    const { system, user } = construirPrompt(senales)
    const resultado = await generarBriefing(system, user)
    if (!resultado) return jsonRes({ ok: false, error: 'IA no devolvió contenido' }, 500)

    // Coste aproximado Haiku 4.5: $0.80 in / $4.00 out por MTok
    const coste = (resultado.tokensIn * 0.8 + resultado.tokensOut * 4.0) / 1_000_000

    const resumenCorto = extraerResumenCorto(resultado.contenido)

    await insertarBriefing({
      fecha,
      contenido_md: resultado.contenido,
      resumen_corto: resumenCorto,
      modelo: resultado.modelo,
      tokens_in: resultado.tokensIn,
      tokens_out: resultado.tokensOut,
      coste_eur: coste,
      fuente: auth.isService ? 'cron' : 'manual',
      generated_by: auth.isService ? null : (auth.userId ?? null),
    })

    return jsonRes({
      ok: true,
      fecha,
      contenido_md: resultado.contenido,
      resumen_corto: resumenCorto,
      modelo: resultado.modelo,
      tokens_in: resultado.tokensIn,
      tokens_out: resultado.tokensOut,
      coste_eur: coste,
    })
  } catch (e) {
    await reportEdgeError(e, { fn: 'dashboard-briefing-diario', extra: { fecha, isService: auth.isService } })
    return jsonRes({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
