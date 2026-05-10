-- FASE 4.3 — Función emit_event()
-- Encapsula el INSERT en events + pg_notify para dispatch en tiempo real.
-- Todos los triggers de negocio la llaman en lugar de insertar directamente.

CREATE OR REPLACE FUNCTION emit_event(
  p_event_type    TEXT,
  p_payload       JSONB,
  p_source        TEXT    DEFAULT NULL,
  p_priority      TEXT    DEFAULT 'medium',
  p_correlation_id UUID   DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO events (
    tenant_id,
    event_type,
    payload,
    source,
    priority,
    correlation_id,
    status
  ) VALUES (
    'ferlu',
    p_event_type,
    p_payload,
    p_source,
    p_priority,
    p_correlation_id,
    'pending'
  )
  RETURNING id INTO v_id;

  -- Notifica al edge event-dispatcher via Supabase Realtime / pg_notify
  PERFORM pg_notify(
    'ferlu_events',
    json_build_object(
      'id',         v_id,
      'event_type', p_event_type,
      'priority',   p_priority,
      'source',     p_source
    )::text
  );

  RETURN v_id;
END;
$$;

-- Solo service_role puede ejecutarla directamente
REVOKE ALL ON FUNCTION emit_event FROM PUBLIC;
GRANT EXECUTE ON FUNCTION emit_event TO service_role;
