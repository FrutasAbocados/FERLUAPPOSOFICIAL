// Edge Function: event-dispatcher v1
// Lee events pendientes, routea por event_type y marca processed/failed.
// Invocado por pg_cron (Sesión 4.8 registra el cron).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const BATCH_SIZE = 50

const dbHeaders = {
  apikey:        SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── PostgREST helpers ────────────────────────────────────────────────────────

async function pgGet(path: string): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: dbHeaders })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`)
  return res.json() as Promise<unknown[]>
}

async function pgPatch(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method:  'PATCH',
    headers: { ...dbHeaders, prefer: 'return=minimal' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${await res.text()}`)
}

// ── Event type ───────────────────────────────────────────────────────────────

type FerluEvent = {
  id:         string
  event_type: string
  payload:    Record<string, unknown>
  priority:   string
  source:     string | null
}

// ── Handlers ─────────────────────────────────────────────────────────────────
// Cada handler recibe el evento tipado. Fase 4: todos son noop porque el
// trigger original ya disparó la acción. Sesión 5+: añadir lógica real aquí.

async function handleNoop(_e: FerluEvent): Promise<void> { /* noop */ }

const HANDLERS: Record<string, (e: FerluEvent) => Promise<void>> = {
  'ferlu.pedido_wa.confirmado':                handleNoop,
  'ferlu.notificacion.push_solicitada':        handleNoop,
  'ferlu.tarea.creada':                        handleNoop,
  'ferlu.tarea.actualizada':                   handleNoop,
  'ferlu.trabajador.puntos_actualizados':      handleNoop,
  'ferlu.trabajador.vacaciones_actualizadas':  handleNoop,
  'ferlu.trabajador.credito_actualizado':      handleNoop,
  'ferlu.abuelo.venta_eliminada':              handleNoop,
}

// ── Dispatch loop ────────────────────────────────────────────────────────────

async function dispatch(): Promise<{ processed: number; failed: number; skipped: number }> {
  const rows = (await pgGet(
    `events?status=eq.pending&order=created_at.asc&limit=${BATCH_SIZE}&select=id,event_type,payload,priority,source`
  )) as FerluEvent[]

  rows.sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
  )

  let processed = 0, failed = 0, skipped = 0

  for (const event of rows) {
    const handler = HANDLERS[event.event_type]

    if (!handler) {
      await pgPatch(`events?id=eq.${event.id}`, {
        status:       'skipped',
        processed_at: new Date().toISOString(),
        processed_by: 'event-dispatcher',
        error:        `no handler: ${event.event_type}`,
      })
      skipped++
      continue
    }

    await pgPatch(`events?id=eq.${event.id}`, {
      status:       'processing',
      processed_by: 'event-dispatcher',
    })

    try {
      await handler(event)
      await pgPatch(`events?id=eq.${event.id}`, {
        status:       'processed',
        processed_at: new Date().toISOString(),
      })
      processed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await pgPatch(`events?id=eq.${event.id}`, {
        status:       'failed',
        processed_at: new Date().toISOString(),
        error:        msg.slice(0, 500),
      })
      failed++
    }
  }

  return { processed, failed, skipped }
}

// ── Serve ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors })

  try {
    const stats = await dispatch()
    return new Response(JSON.stringify({ ok: true, ...stats }), {
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' },
    })
  }
})
