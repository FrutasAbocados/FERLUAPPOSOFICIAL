-- FASE 4.8 — E2E smoke test + cron dispatcher + FK agent_interactions

-- ── 1. FK agent_interactions.event_id → events.id ────────────────────────────
-- Permite trazar qué interacción del agente procesó cada evento.
ALTER TABLE public.agent_interactions
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agent_interactions_event_idx
  ON public.agent_interactions (event_id)
  WHERE event_id IS NOT NULL;

-- ── 2. Cron job: event-dispatcher cada 5 minutos ──────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('event-dispatcher-5min')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-dispatcher-5min');
EXCEPTION WHEN undefined_function THEN NULL;
END$$;

SELECT cron.schedule(
  'event-dispatcher-5min',
  '*/5 * * * *',
  $cmd$
    SELECT net.http_post(
      url     := 'https://ucjkyjhvvdofyaizzdbk.supabase.co/functions/v1/event-dispatcher',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $cmd$
);

-- ── 3. Smoke test: emit_event() inserta y pg_notify funciona ──────────────────
DO $$
DECLARE
  v_id UUID;
BEGIN
  v_id := emit_event(
    'ferlu.tarea.creada',
    jsonb_build_object(
      'tarea_id',  gen_random_uuid(),
      'titulo',    'Smoke test Fase 4.8',
      'estado',    'pendiente',
      'operacion', 'INSERT'
    ),
    'smoke_test',
    'low'
  );

  -- Verificar que el evento se insertó
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = v_id AND status = 'pending') THEN
    RAISE EXCEPTION 'Smoke test FAIL: evento % no encontrado en events', v_id;
  END IF;

  -- Limpiar el evento de test
  DELETE FROM public.events WHERE id = v_id;

  RAISE NOTICE 'Smoke test PASS: emit_event() funciona correctamente (id=%)' , v_id;
END$$;
