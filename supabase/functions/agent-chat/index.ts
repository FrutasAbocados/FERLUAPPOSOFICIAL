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
const MODEL          = Deno.env.get('AGENT_MODEL') || 'claude-sonnet-4-5'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

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

  let body: { messages?: Msg[]; currentDate?: string } = {}
  try { body = await req.json() } catch { /* nada */ }
  const userMessages = body.messages ?? []
  const today = body.currentDate || new Date().toISOString().slice(0, 10)

  const system = `Eres un asistente experto en análisis de negocio para Frutas Abocados, una distribuidora mayorista de frutas y verduras en Málaga (España).

Hoy es ${today}.

Tienes acceso a herramientas que consultan datos REALES desde Supabase (sincronizado con Holded ERP). Usa siempre las herramientas para datos concretos — NO inventes cifras.

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

Si una pregunta requiere varias herramientas, encadena llamadas. Si la pregunta no se puede responder con los datos disponibles, dilo claramente.`

  // Convert messages al formato Anthropic
  const anthropicMessages: Array<unknown> = userMessages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  const toolCalls: Array<{ name: string; input: unknown; summary?: string }> = []
  let finalText = ''
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
    const data = await res.json() as {
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

  return json({ reply: finalText || '(sin respuesta)', toolCalls })
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
