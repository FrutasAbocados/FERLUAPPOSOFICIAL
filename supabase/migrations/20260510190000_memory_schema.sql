-- Fase 3: Memoria Empresarial — Schema completo
-- Basado en Blueprint Maestro v2 Parte 5
-- tenant_id = 'ferlu' (single-tenant por ahora, TEXT para futuro)

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─────────────────────────────────────────
-- 1. memory_facts — hechos del negocio
-- ─────────────────────────────────────────
CREATE TABLE memory_facts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT NOT NULL,
  category     TEXT NOT NULL,
  subcategory  TEXT,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  importance   SMALLINT NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  confidence   NUMERIC(3,2) NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  source       TEXT NOT NULL DEFAULT 'system',
  valid_from   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until  TIMESTAMPTZ,
  tags         TEXT[] DEFAULT '{}',
  metadata     JSONB DEFAULT '{}',
  embedding    vector(1536),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_facts_tenant     ON memory_facts(tenant_id);
CREATE INDEX idx_memory_facts_category   ON memory_facts(tenant_id, category, subcategory);
CREATE INDEX idx_memory_facts_tags       ON memory_facts USING GIN(tags);
CREATE INDEX idx_memory_facts_trgm       ON memory_facts USING GIN(content gin_trgm_ops);
CREATE INDEX idx_memory_facts_embedding  ON memory_facts USING hnsw (embedding vector_cosine_ops);

ALTER TABLE memory_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY memory_facts_tenant_isolation ON memory_facts
  USING (tenant_id = current_setting('app.tenant_id', true));

-- ─────────────────────────────────────────
-- 2. memory_decisions — decisiones tomadas
-- ─────────────────────────────────────────
CREATE TABLE memory_decisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT NOT NULL,
  title        TEXT NOT NULL,
  context      TEXT NOT NULL,
  decision     TEXT NOT NULL,
  rationale    TEXT,
  outcome      TEXT,
  outcome_date TIMESTAMPTZ,
  made_by      TEXT NOT NULL DEFAULT 'luis',
  tags         TEXT[] DEFAULT '{}',
  importance   SMALLINT NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  embedding    vector(1536),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_decisions_tenant ON memory_decisions(tenant_id, created_at DESC);
CREATE INDEX idx_memory_decisions_tags   ON memory_decisions USING GIN(tags);

ALTER TABLE memory_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY memory_decisions_tenant ON memory_decisions
  USING (tenant_id = current_setting('app.tenant_id', true));

-- ─────────────────────────────────────────
-- 3. memory_problems — problemas y lecciones
-- ─────────────────────────────────────────
CREATE TABLE memory_problems (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  root_cause       TEXT,
  solution         TEXT,
  prevention       TEXT,
  status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','solved','monitoring','recurring')),
  recurrence_count INT NOT NULL DEFAULT 1,
  first_occurred   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_occurred    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  solved_at        TIMESTAMPTZ,
  tags             TEXT[] DEFAULT '{}',
  embedding        vector(1536),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_problems_tenant ON memory_problems(tenant_id, status);
CREATE INDEX idx_memory_problems_tags   ON memory_problems USING GIN(tags);

ALTER TABLE memory_problems ENABLE ROW LEVEL SECURITY;
CREATE POLICY memory_problems_tenant ON memory_problems
  USING (tenant_id = current_setting('app.tenant_id', true));

-- ─────────────────────────────────────────
-- 4. memory_patterns — patrones detectados
-- ─────────────────────────────────────────
CREATE TABLE memory_patterns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL,
  pattern_type      TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  trigger_conditions JSONB,
  expected_outcome  JSONB,
  confidence        NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  observations      INT NOT NULL DEFAULT 1,
  last_observed     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tags              TEXT[] DEFAULT '{}',
  embedding         vector(1536),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_patterns_tenant ON memory_patterns(tenant_id, pattern_type);
CREATE INDEX idx_memory_patterns_tags   ON memory_patterns USING GIN(tags);

ALTER TABLE memory_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY memory_patterns_tenant ON memory_patterns
  USING (tenant_id = current_setting('app.tenant_id', true));

-- ─────────────────────────────────────────
-- 5. agent_interactions — log de IA (coste, latencia, acciones)
-- ─────────────────────────────────────────
CREATE TABLE agent_interactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL,
  agent_name        TEXT NOT NULL,
  model_used        TEXT NOT NULL,
  event_type        TEXT,
  input_tokens      INT,
  output_tokens     INT,
  cache_read_tokens INT NOT NULL DEFAULT 0,
  cache_write_tokens INT NOT NULL DEFAULT 0,
  cost_eur          NUMERIC(10,6),
  latency_ms        INT,
  success           BOOLEAN NOT NULL DEFAULT TRUE,
  error             TEXT,
  input_summary     TEXT,
  output_summary    TEXT,
  actions_taken     JSONB DEFAULT '[]',
  memory_accessed   UUID[] DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_interactions_tenant ON agent_interactions(tenant_id, created_at DESC);
CREATE INDEX idx_agent_interactions_agent  ON agent_interactions(agent_name, created_at DESC);

ALTER TABLE agent_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_interactions_tenant ON agent_interactions
  USING (tenant_id = current_setting('app.tenant_id', true));

-- ─────────────────────────────────────────
-- 6. business_metrics — time series ligero
-- ─────────────────────────────────────────
CREATE TABLE business_metrics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT NOT NULL,
  metric_name  TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  dimensions   JSONB DEFAULT '{}',
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_metrics_lookup ON business_metrics(tenant_id, metric_name, recorded_at DESC);

ALTER TABLE business_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_metrics_tenant ON business_metrics
  USING (tenant_id = current_setting('app.tenant_id', true));
