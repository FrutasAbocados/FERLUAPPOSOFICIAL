// Edge Function: agent-chat
// ----------------------------------------------------------------------------
// Chat con un agente IA experto en los datos del Manager Ferlu Abocados.
// Usa Claude API con tool_use sobre las RPCs públicas del Manager.
//
// Body JSON:
//   { messages: Array<{role:'user'|'assistant', content:string}>,
//     currentDate?: 'YYYY-MM-DD' }
//
// Devuelve: { reply: string, toolCalls: Array<{name, input, summary}> }
// ----------------------------------------------------------------------------

const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY  = Deno.env.get('ANTHROPIC_API_KEY') || ''
const MODEL          = Deno.env.get('AGENT_MODEL') || 'claude-sonnet-4-6'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TENANT_ID      = 'ferlu'

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

// ---------------------------------------------------------------------------
// Helpers de Memoria Empresarial (Fase 3 Plan Maestro)
// ---------------------------------------------------------------------------

interface MemoryDecision {
  id: string; title: string; context: string; decision: string
  rationale?: string | null; made_by: string; created_at: string
}

/** Últimas N decisiones del tenant (no requiere embeddings) */
async function fetchRecentDecisions(limit = 5): Promise<MemoryDecision[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/memory_decisions?tenant_id=eq.${TENANT_ID}&order=created_at.desc&limit=${limit}`,
      { headers: dbHeaders },
    )
    if (!res.ok) return []
    return await res.json() as MemoryDecision[]
  } catch { return [] }
}

/** Construye el bloque de contexto que se inyecta en el system prompt */
function buildMemoryBlock(decisions: MemoryDecision[]): string {
  if (!decisions.length) return ''

  const lines = decisions.map(d =>
    `- [${d.created_at.slice(0, 10)}] ${d.title}: ${d.decision}${d.rationale ? ` (${d.rationale})` : ''}`
  )
  return `\n\n--- MEMORIA EMPRESARIAL ---\nÚltimas decisiones registradas:\n${lines.join('\n')}`
}

/** Registra la interacción en agent_interactions (fire-and-forget) */
async function logInteraction(opts: {
  inputTokens: number; outputTokens: number; cacheReadTokens: number
  costEur: number; latencyMs: number; success: boolean
  inputSummary: string; outputSummary: string; toolCount: number
}): Promise<void> {
  const body = {
    tenant_id:          TENANT_ID,
    agent_name:         'agent-chat',
    model_used:         MODEL,
    input_tokens:       opts.inputTokens,
    output_tokens:      opts.outputTokens,
    cache_read_tokens:  opts.cacheReadTokens,
    cost_eur:           opts.costEur,
    latency_ms:         opts.latencyMs,
    success:            opts.success,
    input_summary:      opts.inputSummary.slice(0, 500),
    output_summary:     opts.outputSummary.slice(0, 500),
    actions_taken:      [{ tool_calls: opts.toolCount }],
  }
  await fetch(`${SUPABASE_URL}/rest/v1/agent_interactions`, {
    method: 'POST',
    headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  }).catch(() => { /* fire-and-forget */ })
}

/** Precio €/token Sonnet 4.5–4.6 (input $2.7/1M, output $13.5/1M, cache_read $0.27/1M @ ~0.93 USD/EUR) */
const EUR_PER_TOKEN = { input: 2.511e-6, output: 12.555e-6, cacheRead: 0.2511e-6 }

// ---------------------------------------------------------------------------
// Tools que el agente puede invocar
// ---------------------------------------------------------------------------
const tools = [
  {
    name: 'get_resumen',
    description: 'KPIs del periodo (ventas, compras, COGS, margen, pendiente cobro) con comparativa al periodo anterior equivalente.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD' },
        to:   { type: 'string', description: 'Fecha fin YYYY-MM-DD' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_top_clientes',
    description: 'Top N clientes por margen € en el periodo. Devuelve nombre canónico, ventas, margen, % margen, docs.',
    input_schema: {
      type: 'object',
      properties: {
        from:  { type: 'string' },
        to:    { type: 'string' },
        limit: { type: 'integer', default: 10 },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_top_productos',
    description: 'Top N productos por margen € en el periodo. Devuelve nombre, ventas, margen, % margen, unidades.',
    input_schema: {
      type: 'object',
      properties: {
        from:  { type: 'string' },
        to:    { type: 'string' },
        limit: { type: 'integer', default: 10 },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_clientes_lista',
    description: 'Lista completa de clientes del periodo con métricas. Usa esto para responder "cuántos clientes" o filtrar.',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_cliente_detalle',
    description: 'Facturas y productos favoritos de un cliente (por nombre canónico exacto). Usa primero get_clientes_lista para encontrar el nombre exacto.',
    input_schema: {
      type: 'object',
      properties: {
        contact_name_canon: { type: 'string' },
        from: { type: 'string' },
        to:   { type: 'string' },
      },
      required: ['contact_name_canon', 'from', 'to'],
    },
  },
  {
    name: 'get_productos_lista',
    description: 'Lista completa de productos del periodo con métricas (ventas, margen, coste actual).',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_serie_diaria',
    description: 'Ventas/compras/margen por día en el periodo. Útil para detectar picos.',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_clientes_inactivos',
    description: 'Clientes con cadencia rota (han parado de pedir vs su patrón habitual).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_pedidos_esperados',
    description: 'Clientes con pedido esperado próximos 7 días según su cadencia. Devuelve urgente/pronto/esta_semana.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_recomendaciones',
    description: 'Insights operativos accionables: vendiendo bajo coste, clientes que bajan/suben, dejaron producto, productos que se apagan.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_patrones_dia_semana',
    description: 'Ventas y docs medios por día semana (lun-dom) en el periodo.',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_forecast',
    description: 'Forecast próximos meses con tendencia mes-a-mes capeada y proyección del mes en curso.',
    input_schema: { type: 'object', properties: {} },
  },

  // ── Caja ─────────────────────────────────────────────────────────────────
  {
    name: 'get_cierres_mes',
    description: 'Cierres de caja de un mes: efectivo, tarjeta, compras, deuda generada/cobrada, resultado por día. Usa esto para el calendario o resumen mensual de Caja.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (normalmente primer día del mes)' },
        to:   { type: 'string', description: 'Fecha fin YYYY-MM-DD (normalmente último día del mes)' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_cierre_dia',
    description: 'Detalle completo del cierre de caja de un día: efectivo, tarjeta, compras, vehículos, deuda generada/cobrada, resultado, caja física, observaciones.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha YYYY-MM-DD' },
      },
      required: ['fecha'],
    },
  },
  {
    name: 'get_deuda_acum',
    description: 'Deuda acumulada hasta una fecha: suma histórica de (deuda_generada - deuda_cobrada) de todos los cierres hasta esa fecha.',
    input_schema: {
      type: 'object',
      properties: {
        hasta: { type: 'string', description: 'Fecha límite YYYY-MM-DD (inclusive)' },
      },
      required: ['hasta'],
    },
  },
  {
    name: 'get_repartos_dia',
    description: 'Jornadas de reparto de un día: qué empleado repartió, hora inicio/fin, y lista de clientes con importe y forma de pago (efectivo/tarjeta). Útil para ver quién cobró qué.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha YYYY-MM-DD' },
      },
      required: ['fecha'],
    },
  },
  {
    name: 'get_cash_stats_semanas',
    description: 'Estadísticas semanales de Caja por repartidor: horas trabajadas, total cobrado (efectivo + tarjeta), número de jornadas. Útil para comparar rendimiento por semana o por empleado.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Fecha inicio YYYY-MM-DD' },
        to:   { type: 'string', description: 'Fecha fin YYYY-MM-DD' },
      },
      required: ['from', 'to'],
    },
  },
]

// ---------------------------------------------------------------------------
// Implementación de cada tool: llama a la RPC correspondiente
// ---------------------------------------------------------------------------
async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: dbHeaders,
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return await res.json()
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const args = input ?? {}
  switch (name) {
    case 'get_resumen':
      return await rpc('manager_resumen_comparativo', { p_from: args.from, p_to: args.to })
    case 'get_top_clientes':
      return await rpc('manager_top_clientes_margen', { p_from: args.from, p_to: args.to, p_limit: args.limit ?? 10 })
    case 'get_top_productos':
      return await rpc('manager_top_productos_margen', { p_from: args.from, p_to: args.to, p_limit: args.limit ?? 10 })
    case 'get_clientes_lista':
      return await rpc('manager_clientes_lista', { p_from: args.from, p_to: args.to })
    case 'get_cliente_detalle': {
      const [facturas, productos] = await Promise.all([
        rpc('manager_cliente_facturas',  { p_contact_name_canon: args.contact_name_canon, p_from: args.from, p_to: args.to }),
        rpc('manager_cliente_productos', { p_contact_name_canon: args.contact_name_canon, p_from: args.from, p_to: args.to, p_limit: 30 }),
      ])
      return { facturas, productos }
    }
    case 'get_productos_lista':
      return await rpc('manager_productos_lista', { p_from: args.from, p_to: args.to })
    case 'get_serie_diaria':
      return await rpc('manager_serie_diaria', { p_from: args.from, p_to: args.to })
    case 'get_clientes_inactivos':
      return await rpc('dashboard_clientes_inactivos')
    case 'get_pedidos_esperados':
      return await rpc('manager_pedidos_proximos')
    case 'get_recomendaciones':
      return await rpc('manager_recomendaciones')
    case 'get_patrones_dia_semana':
      return await rpc('manager_patrones_dia_semana', { p_from: args.from, p_to: args.to })
    case 'get_forecast':
      return await rpc('manager_forecast_proximo_mes')

    // ── Caja ───────────────────────────────────────────────────────────────
    case 'get_cierres_mes': {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/cierres?fecha=gte.${args.from}&fecha=lte.${args.to}&order=fecha.asc`,
        { headers: dbHeaders },
      )
      if (!res.ok) throw new Error(`cierres ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return await res.json()
    }
    case 'get_cierre_dia': {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/cierres?fecha=eq.${args.fecha}`,
        { headers: dbHeaders },
      )
      if (!res.ok) throw new Error(`cierre_dia ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const rows = await res.json() as unknown[]
      return rows[0] ?? null
    }
    case 'get_deuda_acum': {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/cierres?fecha=lte.${args.hasta}&select=deuda_generada,deuda_cobrada`,
        { headers: dbHeaders },
      )
      if (!res.ok) throw new Error(`deuda_acum ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const rows = await res.json() as Array<{ deuda_generada: string; deuda_cobrada: string }>
      const total = rows.reduce((acc, r) => acc + Number(r.deuda_generada) - Number(r.deuda_cobrada), 0)
      return { deuda_acumulada: Math.round(total * 100) / 100, hasta: args.hasta, num_cierres: rows.length }
    }
    case 'get_repartos_dia': {
      const jorRes = await fetch(
        `${SUPABASE_URL}/rest/v1/repartos_jornada?fecha=eq.${args.fecha}&select=*`,
        { headers: dbHeaders },
      )
      if (!jorRes.ok) throw new Error(`repartos_jornada ${jorRes.status}`)
      const jornadas = await jorRes.json() as Array<{ id: string; empleado_id: string; hora_inicio: string | null; hora_fin: string | null; notas: string | null }>
      if (jornadas.length === 0) return []
      const ids = jornadas.map(j => j.id).join(',')
      const linRes = await fetch(
        `${SUPABASE_URL}/rest/v1/repartos_jornada_lineas?jornada_id=in.(${ids})&select=*&order=orden.asc`,
        { headers: dbHeaders },
      )
      if (!linRes.ok) throw new Error(`repartos_lineas ${linRes.status}`)
      const lineas = await linRes.json() as Array<{ jornada_id: string; contact_nombre: string; importe: string; forma_pago: string }>
      return jornadas.map(j => {
        const propias = lineas.filter(l => l.jornada_id === j.id)
        return {
          ...j,
          lineas: propias.map(l => ({ contact_nombre: l.contact_nombre, importe: Number(l.importe), forma_pago: l.forma_pago })),
          total: Math.round(propias.reduce((s, l) => s + Number(l.importe), 0) * 100) / 100,
          efectivo: Math.round(propias.filter(l => l.forma_pago === 'efectivo').reduce((s, l) => s + Number(l.importe), 0) * 100) / 100,
          tarjeta:  Math.round(propias.filter(l => l.forma_pago === 'tarjeta').reduce((s, l) => s + Number(l.importe), 0) * 100) / 100,
        }
      })
    }
    case 'get_cash_stats_semanas':
      return await rpc('cash_stats_semanas', { p_from: args.from, p_to: args.to })

    default:
      throw new Error(`Tool desconocido: ${name}`)
  }
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Msg {
  role: 'user' | 'assistant'
  content: string | Array<unknown>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!ANTHROPIC_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500)
  }

  const t0 = Date.now()
  let body: { messages?: Msg[]; currentDate?: string } = {}
  try { body = await req.json() } catch { /* nada */ }
  const userMessages = body.messages ?? []
  const today = body.currentDate || new Date().toISOString().slice(0, 10)

  // Cargar contexto de memoria (no bloquea si falla)
  const recentDecisions = await fetchRecentDecisions(5)
  const memoryBlock = buildMemoryBlock(recentDecisions)

  const system = `Eres un asistente experto en análisis de negocio para Frutas Abocados, una distribuidora mayorista de frutas y verduras en Málaga (España).

Hoy es ${today}.

Tienes acceso a herramientas que consultan datos REALES desde Supabase (sincronizado con Holded ERP). Usa siempre las herramientas para datos concretos — NO inventes cifras.

Tienes acceso a dos módulos: **Manager** (ventas/compras/clientes/productos desde Holded) y **Caja** (cobros diarios de repartidores, cierres físicos de caja, deuda acumulada).

Reglas de negocio del Manager:
- Las ventas se desglosan por subtipo: invoice (factura cobrada al momento), waybill (albarán cobrado a fin de mes), salesreceipt (TPV), creditnote (abono).
- Para clientes con waybills en un mes, sus invoices ese mes se IGNORAN (la invoice agregada de fin de mes duplica los albaranes). Las herramientas ya aplican esta regla.
- Pendiente de cobro = suma waybills del periodo (las invoices se cobran al momento).
- Margen real = ventas_subtotal - COGS (coste mercancía). El IVA es 4% (superreducido frutas).
- Las cifras que muestran las herramientas en "ventas" suelen ser TOTAL CON IVA (cuadran 1:1 con Holded).
- Aliases unifican nombres distintos del mismo cliente (ej. "Victor Vinilo King SLU (Cocktail)" + "(Victor Beach)" → "Victor Vinilo King SLU").

Cuando el usuario te pregunte por un periodo:
- "hoy" = ${today}
- "esta semana" = lunes a hoy
- "este mes" = primer día del mes a hoy
- "mes pasado" = mes natural anterior completo
- Si no especifica, usa "este mes".

Responde en español, conciso y directo. Cuando muestres listas, usa Markdown (tablas o listas con guión). Pon cifras en formato europeo (ej. 1.234,56 €).

Reglas de negocio de Caja:
- Un "cierre" = registro diario con lo que entró en caja (efectivo + tarjeta + otros) y lo que salió (compras, vehículos, otras). El campo "resultado" = total_cobrado - total_gastos.
- "Deuda generada" en un cierre = ventas fiadas ese día. "Deuda cobrada" = pagos de deuda recibidos ese día.
- Los "repartos" son los cobros que hace cada repartidor en ruta: por cliente, con importe y forma de pago (efectivo/tarjeta). Pueden existir varias jornadas por día (uno por repartidor).
- La deuda acumulada se calcula sumando toda la historia: Σ(deuda_generada - deuda_cobrada) hasta la fecha.
- Para ver cuánto cobró un repartidor en una semana, usa get_cash_stats_semanas.
- Para ver el detalle de un día concreto (quién cobró qué a quién), usa get_repartos_dia.

Si una pregunta requiere varias herramientas, encadena llamadas. Si la pregunta no se puede responder con los datos disponibles, dilo claramente.${memoryBlock}`

  // Convert messages al formato Anthropic
  const anthropicMessages: Array<unknown> = userMessages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  const toolCalls: Array<{ name: string; input: unknown; summary?: string }> = []
  let finalText = ''
  let lastData: unknown = null
  const MAX_ITERS = 6

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system,
        tools,
        messages: anthropicMessages,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return json({ error: `Anthropic ${res.status}: ${errText.slice(0, 500)}`, toolCalls }, 500)
    }
    const data = lastData = await res.json() as {
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>
      stop_reason: string
    }

    // Añadir respuesta del modelo a los mensajes
    anthropicMessages.push({ role: 'assistant', content: data.content })

    // Si hay tool_use, ejecutar y continuar
    const toolUseBlocks = data.content.filter(b => b.type === 'tool_use')
    if (toolUseBlocks.length === 0) {
      // Respuesta final: extraer texto
      finalText = data.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n').trim()
      break
    }

    const toolResults: Array<unknown> = []
    for (const block of toolUseBlocks) {
      const name = block.name!
      const input = block.input ?? {}
      try {
        const result = await executeTool(name, input)
        toolCalls.push({ name, input, summary: `OK (${Array.isArray(result) ? result.length + ' rows' : 'object'})` })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result).slice(0, 60_000),
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toolCalls.push({ name, input, summary: `ERR ${msg.slice(0, 100)}` })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          is_error: true,
          content: `Error: ${msg}`,
        })
      }
    }
    anthropicMessages.push({ role: 'user', content: toolResults })
  }

  const reply = finalText || '(sin respuesta)'

  // Log en agent_interactions (fire-and-forget, no bloquea la respuesta)
  const lastUsage = (lastData as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } } | null)?.usage
  const inputTokens     = lastUsage?.input_tokens ?? 0
  const outputTokens    = lastUsage?.output_tokens ?? 0
  const cacheReadTokens = lastUsage?.cache_read_input_tokens ?? 0
  const costEur = inputTokens * EUR_PER_TOKEN.input
               + outputTokens * EUR_PER_TOKEN.output
               + cacheReadTokens * EUR_PER_TOKEN.cacheRead
  const userText = userMessages.at(-1)?.content
  logInteraction({
    inputTokens, outputTokens, cacheReadTokens,
    costEur: Math.round(costEur * 1e6) / 1e6,
    latencyMs: Date.now() - t0,
    success: true,
    inputSummary: typeof userText === 'string' ? userText : '',
    outputSummary: reply,
    toolCount: toolCalls.length,
  })

  return json({ reply, toolCalls })
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
