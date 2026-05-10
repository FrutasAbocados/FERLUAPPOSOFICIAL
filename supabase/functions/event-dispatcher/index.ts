// Edge Function: event-dispatcher v3 — Fase 6.9 Agent Metrics Logging
// v3 changelog: callClaude returns token usage; HandlerResult with agent/tokens;
//               logInteraction → agent_interactions (fire-and-forget);
//               handleCierreDia + handleDeudaAlta added (FinanceAgent 6.8 completado).
//
// Env vars:
//   ANTHROPIC_API_KEY       — ya existía en agent-chat
//   TELEGRAM_BOT_TOKEN      — bot token del canal personal de Luis
//   TELEGRAM_ADMIN_CHAT_ID  — 7657880016 (chat_id Luis)
//   AGENTS_CONFIG           — JSON: {"enabled":false,"agents":{...}}
//                             DEFAULT = disabled (cero gasto IA)

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const TG_TOKEN      = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''
const TG_CHAT       = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID') || ''

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const BATCH_SIZE  = 50
const USD_TO_EUR  = 0.92

const dbH = {
  apikey:          SERVICE_KEY,
  authorization:   `Bearer ${SERVICE_KEY}`,
  'content-type':  'application/json',
}

// ── AgentsConfig ──────────────────────────────────────────────────────────────

interface AgentsConfig { enabled: boolean; agents: Record<string, { enabled: boolean }> }

function parseAgentsConfig(raw: string | undefined): AgentsConfig {
  if (!raw) return { enabled: false, agents: {} }
  try {
    const p = JSON.parse(raw) as Partial<AgentsConfig>
    return { enabled: p.enabled ?? false, agents: p.agents ?? {} }
  } catch { return { enabled: false, agents: {} } }
}

const AGENTS = parseAgentsConfig(Deno.env.get('AGENTS_CONFIG'))

function agentEnabled(name: string): boolean {
  if (!AGENTS.enabled) return false
  return AGENTS.agents[name]?.enabled ?? true
}

// ── Claude API — devuelve texto + uso de tokens ───────────────────────────────

interface ClaudeResponse {
  text: string; model: string
  inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number
}

async function callClaude(
  system: string, prompt: string,
  model = 'claude-haiku-4-5-20251001', maxTokens = 200,
): Promise<ClaudeResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY,
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      system:   [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`)
  const data = await res.json() as {
    content: Array<{ type: string; text?: string }>
    usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
  }
  return {
    text:        data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n'),
    model,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    cacheRead:   data.usage.cache_read_input_tokens  ?? 0,
    cacheWrite:  data.usage.cache_creation_input_tokens ?? 0,
  }
}

// ── Cost helpers (USD → EUR) ──────────────────────────────────────────────────

const COST_USD_PER_M: Record<string, { in: number; out: number; cr: number; cw: number }> = {
  'claude-haiku-4-5-20251001': { in: 0.80, out:  4.00, cr: 0.08, cw: 1.00 },
  'claude-sonnet-4-6':         { in: 3.00, out: 15.00, cr: 0.30, cw: 3.75 },
}

function costEur(model: string, inT: number, outT: number, cr: number, cw: number): number {
  const c = COST_USD_PER_M[model]
  if (!c) return 0
  return ((inT * c.in + outT * c.out + cr * c.cr + cw * c.cw) / 1_000_000) * USD_TO_EUR
}

// ── HandlerResult + Metrics logger ────────────────────────────────────────────

interface HandlerResult {
  agent: string
  model?: string
  inputTokens?: number; outputTokens?: number; cacheRead?: number; cacheWrite?: number
  actions?: string[]
  outputSummary?: string
}

async function logInteraction(
  result: HandlerResult, eventId: string, eventType: string,
  latencyMs: number, success: boolean, error?: string,
): Promise<void> {
  const model = result.model ?? 'none'
  const cost  = model !== 'none'
    ? costEur(model, result.inputTokens ?? 0, result.outputTokens ?? 0, result.cacheRead ?? 0, result.cacheWrite ?? 0)
    : 0
  await fetch(`${SUPABASE_URL}/rest/v1/agent_interactions`, {
    method: 'POST',
    headers: { ...dbH, prefer: 'return=minimal' },
    body: JSON.stringify({
      tenant_id:          'ferlu',
      agent_name:         result.agent,
      model_used:         model,
      event_type:         eventType,
      event_id:           eventId,
      input_tokens:       result.inputTokens  ?? 0,
      output_tokens:      result.outputTokens ?? 0,
      cache_read_tokens:  result.cacheRead    ?? 0,
      cache_write_tokens: result.cacheWrite   ?? 0,
      cost_eur:           cost,
      latency_ms:         latencyMs,
      success,
      error:              error?.slice(0, 500),
      output_summary:     result.outputSummary,
      actions_taken:      result.actions ? { actions: result.actions } : null,
    }),
  })
}

// ── Helpers generales ─────────────────────────────────────────────────────────

async function pgGet(path: string): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: dbH })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`)
  return res.json() as Promise<unknown[]>
}

async function pgPatch(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...dbH, prefer: 'return=minimal' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${await res.text()}`)
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function tg(text: string): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT) return
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML' }),
  })
}

// ── Supabase helpers para agentes ─────────────────────────────────────────────

async function fetchClientDebt(nombre: string): Promise<number> {
  const h = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, accept: 'application/json' }
  const cr = await fetch(
    `${SUPABASE_URL}/rest/v1/cobros_clientes?nombre=ilike.${encodeURIComponent(nombre)}&select=id&limit=1`,
    { headers: h },
  )
  if (!cr.ok) return 0
  const clientes = await cr.json() as Array<{ id: string }>
  if (!clientes.length || !clientes[0]) return 0
  const mr = await fetch(
    `${SUPABASE_URL}/rest/v1/cobros_movimientos?cliente_id=eq.${clientes[0].id}&pagado=eq.false&select=importe,importe_cobrado`,
    { headers: h },
  )
  if (!mr.ok) return 0
  const movs = await mr.json() as Array<{ importe: string; importe_cobrado: string | null }>
  return movs.reduce((s, m) => s + Number(m.importe) - Number(m.importe_cobrado ?? 0), 0)
}

async function saveMemory(
  category: string, title: string, content: string,
  tags: string[], metadata: Record<string, unknown>,
): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/memory_facts`, {
    method: 'POST',
    headers: { ...dbH, prefer: 'return=minimal' },
    body: JSON.stringify({ tenant_id: 'ferlu', category, title, content, importance: 3, source: 'operations-agent', tags, metadata }),
  })
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

type FerluEvent = {
  id: string; event_type: string
  payload: Record<string, unknown>
  priority: string; source: string | null
}

type Handler = (e: FerluEvent) => Promise<HandlerResult | void>

// ── System prompts ────────────────────────────────────────────────────────────

const OPS_SYSTEM     = 'Eres el asistente de operaciones de Frutas Abocados. Escribe alertas breves (máx 3 líneas) en español para Luis, el gerente. Sé directo. Sin saludos ni despedidas.'
const FINANCE_SYSTEM = 'Eres el agente financiero de Frutas Abocados. Escribe resúmenes ejecutivos concisos en español para Luis, el gerente. Máx 4 líneas. Incluye cifras clave. Sin saludos.'
const AUDIT_SYSTEM   = 'Eres el auditor de sistemas de Frutas Abocados. Genera informes de salud concisos en español para Luis. Formato: estado global emoji (✅/⚠️/🚨) + lista hallazgos + 1-2 acciones prioritarias. Máx 8 líneas. Sin saludos.'

// ── Agent: Operations ─────────────────────────────────────────────────────────

async function handlePedido(e: FerluEvent): Promise<HandlerResult> {
  const p = e.payload as {
    cliente_nombre: string; pedido_id: string; doc_type: string
    lineas: Array<{ producto: string; cantidad: number; precio?: number; unidad?: string }>
  }
  const total = p.lineas.reduce((s, l) => s + l.cantidad * (l.precio ?? 0), 0)
  const deuda = await fetchClientDebt(p.cliente_nombre)
  const fecha = new Date().toISOString().slice(0, 10)

  void saveMemory(
    'cliente', `Pedido ${p.cliente_nombre} ${fecha}`,
    `${p.cliente_nombre} realizó pedido de ${total.toFixed(2)}€ el ${fecha}. Líneas: ${p.lineas.map((l) => `${l.producto} ×${l.cantidad}`).join(', ')}.`,
    ['pedido', p.cliente_nombre.toLowerCase().replace(/\s+/g, '-')],
    { pedido_id: p.pedido_id, total_eur: total, deuda_eur: deuda },
  )

  if (deuda <= 500 && total <= 800) return { agent: 'operations-agent', actions: ['memory_saved'] }

  const lineas = p.lineas.map((l) => `  • ${l.producto}: ${l.cantidad} ${l.unidad ?? ''}`.trimEnd()).join('\n')
  const flags  = [deuda > 500 ? '⚠️ DEUDA ALTA' : '', total > 800 ? '⚠️ PEDIDO GRANDE' : ''].filter(Boolean).join(' + ')
  const prompt = `Cliente: ${p.cliente_nombre}\nPedido ${p.doc_type}: ${total.toFixed(2)}€\nLíneas:\n${lineas}\nDeuda pendiente: ${deuda.toFixed(2)}€\n${flags}\nEscribe alerta breve para Luis (máx 3 líneas).`
  const cr = await callClaude(OPS_SYSTEM, prompt, 'claude-haiku-4-5-20251001', 180)
  await tg(cr.text)
  return {
    agent: 'operations-agent', model: cr.model,
    inputTokens: cr.inputTokens, outputTokens: cr.outputTokens, cacheRead: cr.cacheRead, cacheWrite: cr.cacheWrite,
    outputSummary: cr.text.slice(0, 200), actions: ['alert_sent', 'memory_saved'],
  }
}

async function handleTarea(e: FerluEvent): Promise<HandlerResult> {
  const p = e.payload as { titulo: string; operacion: string; completada?: boolean; asignado_a?: string | null }
  const esNueva      = p.operacion === 'INSERT'
  const esCompletada = p.operacion === 'UPDATE' && p.completada === true
  if (!esNueva && !esCompletada) return { agent: 'operations-agent' }
  const msg = esCompletada
    ? `✅ <b>Tarea completada</b>\n${p.titulo}`
    : `📋 <b>Nueva tarea</b>\n${p.titulo}${p.asignado_a ? `\nAsignada a: ${p.asignado_a}` : ' (sin asignar)'}`
  await tg(msg)
  return { agent: 'operations-agent', actions: ['tarea_notified'] }
}

async function handlePuntos(e: FerluEvent): Promise<HandlerResult> {
  const p = e.payload as { empleado_id: string; puntos: number; motivo?: string | null }
  await tg(`<b>Puntos actualizados</b>\nEmpleado: ${p.empleado_id}\nPuntos: ${p.puntos}${p.motivo ? ` — ${p.motivo}` : ''}`)
  return { agent: 'operations-agent', actions: ['puntos_notified'] }
}

async function handleVacaciones(e: FerluEvent): Promise<HandlerResult> {
  const p = e.payload as { empleado_id: string; fecha_inicio: string; fecha_fin?: string | null; estado: string }
  await tg(`<b>Vacaciones ${p.estado}</b>\nEmpleado: ${p.empleado_id}\n${p.fecha_inicio}${p.fecha_fin ? ` → ${p.fecha_fin}` : ''}`)
  return { agent: 'operations-agent', actions: ['vacaciones_notified'] }
}

async function handleCredito(e: FerluEvent): Promise<HandlerResult> {
  const p = e.payload as { empleado_id: string; credito_total: number }
  if (p.credito_total < 200) return { agent: 'operations-agent' }
  await tg(`<b>Crédito alto</b>\nEmpleado: ${p.empleado_id}\nTotal: ${p.credito_total.toFixed(2)}€`)
  return { agent: 'operations-agent', actions: ['credito_alert_sent'] }
}

// ── Agent: Finance ────────────────────────────────────────────────────────────

async function handleAbueloVenta(e: FerluEvent): Promise<HandlerResult> {
  const p = e.payload as { venta_id: string; manager_factura_id?: string | null }
  await tg(`⚠️ <b>Venta Abuelo eliminada</b>\nID: ${p.venta_id.slice(0, 8)}…\n${p.manager_factura_id ? `Espejo: ${p.manager_factura_id.slice(0, 8)}…` : 'Sin espejo en manager'}`)
  return { agent: 'finance-agent', actions: ['abuelo_venta_alert_sent'] }
}

async function handleCierreDia(e: FerluEvent): Promise<HandlerResult> {
  const p = e.payload as { fecha: string }
  const h = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, accept: 'application/json' }

  const cr = await fetch(
    `${SUPABASE_URL}/rest/v1/cierres?fecha=eq.${p.fecha}&select=efectivo,tarjeta,otros_efectivo,otros_tarjeta,compras,total_cobrado`,
    { headers: h },
  )
  const rows = cr.ok ? (await cr.json() as Array<Record<string, string>>) : []
  const sum  = rows.reduce(
    (a, r) => ({
      efectivo:      a.efectivo      + Number(r.efectivo      ?? 0),
      tarjeta:       a.tarjeta       + Number(r.tarjeta       ?? 0),
      compras:       a.compras       + Number(r.compras       ?? 0),
      total_cobrado: a.total_cobrado + Number(r.total_cobrado ?? 0),
    }),
    { efectivo: 0, tarjeta: 0, compras: 0, total_cobrado: 0 },
  )

  const prompt = `Cierre de día ${p.fecha} — Frutas Abocados:\nTotal cobrado: ${sum.total_cobrado.toFixed(2)}€\nEfectivo: ${sum.efectivo.toFixed(2)}€ | Tarjeta: ${sum.tarjeta.toFixed(2)}€\nCompras del día: ${sum.compras.toFixed(2)}€\nGenera resumen ejecutivo conciso (máx 4 líneas).`
  const res = await callClaude(FINANCE_SYSTEM, prompt, 'claude-haiku-4-5-20251001', 200)
  await tg(`📊 <b>Cierre ${p.fecha}</b>\n${res.text}`)
  return {
    agent: 'finance-agent', model: res.model,
    inputTokens: res.inputTokens, outputTokens: res.outputTokens, cacheRead: res.cacheRead, cacheWrite: res.cacheWrite,
    outputSummary: res.text.slice(0, 200), actions: ['cierre_summary_sent'],
  }
}

async function handleDeudaAlta(e: FerluEvent): Promise<HandlerResult> {
  const p = e.payload as { cliente_nombre: string; deuda_total: number; num_facturas: number }
  await tg(`🚨 <b>Deuda alta</b>\nCliente: ${p.cliente_nombre}\nDeuda: ${p.deuda_total.toFixed(2)}€ (${p.num_facturas} facturas)\n⚠️ Acción requerida`)
  return { agent: 'finance-agent', actions: ['deuda_alta_alert_sent'] }
}

// ── Agent: Audit ──────────────────────────────────────────────────────────────

async function handleAuditRequested(_e: FerluEvent): Promise<HandlerResult> {
  const h = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, accept: 'application/json' }
  const since24h    = new Date(Date.now() - 86_400_000).toISOString()
  const stuckBefore = new Date(Date.now() - 1_800_000).toISOString()

  const [pend, fail, inter] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/events?status=eq.pending&created_at=lt.${stuckBefore}&select=id`, { headers: h })
      .then((r) => r.json() as Promise<unknown[]>).then((a) => a.length).catch(() => -1),
    fetch(`${SUPABASE_URL}/rest/v1/events?status=eq.failed&created_at=gte.${since24h}&select=id`, { headers: h })
      .then((r) => r.json() as Promise<unknown[]>).then((a) => a.length).catch(() => -1),
    fetch(`${SUPABASE_URL}/rest/v1/agent_interactions?created_at=gte.${since24h}&select=success`, { headers: h })
      .then((r) => r.json() as Promise<Array<{ success: boolean }>>).catch(() => [] as Array<{ success: boolean }>),
  ])
  const errors = Array.isArray(inter) ? inter.filter((i) => !i.success).length : 0
  const calls  = Array.isArray(inter) ? inter.length : 0

  const prompt = `Auditoría Ferlu ${new Date().toISOString().slice(0, 10)}\nEventos atascados >30min: ${pend}\nEventos fallidos 24h: ${fail}\nLlamadas agente 24h: ${calls} (errores: ${errors})\nGenera informe de salud.`
  const res = await callClaude(AUDIT_SYSTEM, prompt, 'claude-sonnet-4-6', 350)
  await tg(res.text)
  return {
    agent: 'audit-agent', model: res.model,
    inputTokens: res.inputTokens, outputTokens: res.outputTokens, cacheRead: res.cacheRead, cacheWrite: res.cacheWrite,
    outputSummary: res.text.slice(0, 200), actions: ['audit_report_sent'],
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

function buildHandlers(): Record<string, Handler> {
  const noop: Handler = () => Promise.resolve()
  const ops = agentEnabled('operations')
  const fin = agentEnabled('finance')
  const aud = agentEnabled('audit')

  return {
    'ferlu.pedido_wa.confirmado':               ops ? handlePedido         : noop,
    'ferlu.notificacion.push_solicitada':       noop,
    'ferlu.tarea.creada':                       ops ? handleTarea          : noop,
    'ferlu.tarea.actualizada':                  ops ? handleTarea          : noop,
    'ferlu.trabajador.puntos_actualizados':     ops ? handlePuntos         : noop,
    'ferlu.trabajador.vacaciones_actualizadas': ops ? handleVacaciones     : noop,
    'ferlu.trabajador.credito_actualizado':     ops ? handleCredito        : noop,
    'ferlu.abuelo.venta_eliminada':             fin ? handleAbueloVenta    : noop,
    'ferlu.caja.cierre_dia':                    fin ? handleCierreDia      : noop,
    'ferlu.cobros.deuda_alta':                  fin ? handleDeudaAlta      : noop,
    'ferlu.audit.requested':                    aud ? handleAuditRequested : noop,
  }
}

// ── Dispatch loop ─────────────────────────────────────────────────────────────

async function dispatch(): Promise<{ processed: number; failed: number; skipped: number }> {
  const HANDLERS = buildHandlers()
  const rows = (await pgGet(
    `events?status=eq.pending&order=created_at.asc&limit=${BATCH_SIZE}&select=id,event_type,payload,priority,source`,
  )) as FerluEvent[]

  rows.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))

  let processed = 0, failed = 0, skipped = 0

  for (const event of rows) {
    const handler = HANDLERS[event.event_type]

    if (!handler) {
      await pgPatch(`events?id=eq.${event.id}`, {
        status: 'skipped', processed_at: new Date().toISOString(),
        processed_by: 'event-dispatcher', error: `no handler: ${event.event_type}`,
      })
      skipped++
      continue
    }

    await pgPatch(`events?id=eq.${event.id}`, { status: 'processing', processed_by: 'event-dispatcher' })

    const t0 = Date.now()
    try {
      const result = await handler(event)
      const latency = Date.now() - t0
      await pgPatch(`events?id=eq.${event.id}`, { status: 'processed', processed_at: new Date().toISOString() })
      if (result) void logInteraction(result, event.id, event.event_type, latency, true)
      processed++
    } catch (err) {
      const latency = Date.now() - t0
      const msg = err instanceof Error ? err.message : String(err)
      await pgPatch(`events?id=eq.${event.id}`, {
        status: 'failed', processed_at: new Date().toISOString(), error: msg.slice(0, 500),
      })
      void logInteraction({ agent: 'event-dispatcher' }, event.id, event.event_type, latency, false, msg)
      failed++
    }
  }

  return { processed, failed, skipped }
}

// ── Serve ─────────────────────────────────────────────────────────────────────

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors })

  try {
    const stats = await dispatch()
    return new Response(JSON.stringify({ ok: true, agents_enabled: AGENTS.enabled, ...stats }), {
      status: 200, headers: { ...cors, 'content-type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...cors, 'content-type': 'application/json' },
    })
  }
})
