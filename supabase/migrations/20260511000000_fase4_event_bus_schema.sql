-- FASE 4 — Event Bus Formal
-- Tabla central de eventos del holding (tenant=ferlu para empezar)

CREATE TABLE IF NOT EXISTS events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT        NOT NULL DEFAULT 'ferlu',
  event_type      TEXT        NOT NULL,           -- 'ferlu.pedido_wa.confirmado', etc.
  payload         JSONB       NOT NULL DEFAULT '{}',
  source          TEXT,                            -- tabla/trigger/edge que lo emitió
  correlation_id  UUID,                            -- enlaza eventos relacionados
  priority        TEXT        NOT NULL DEFAULT 'medium'
                              CHECK (priority IN ('critical','high','medium','low')),
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','processing','processed','failed','skipped')),
  error           TEXT,                            -- si status='failed'
  processed_at    TIMESTAMPTZ,
  processed_by    TEXT,                            -- edge/agente que lo procesó
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS events_dispatch_idx
  ON events (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS events_type_idx
  ON events (tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS events_correlation_idx
  ON events (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON events
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY "service_role_full" ON events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- FK pendiente de Fase 3: agent_interactions.event_id → events.id
-- Se añade en sesión 4.8 cuando los triggers ya emitan eventos reales.
