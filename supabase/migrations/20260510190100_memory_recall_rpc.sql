-- Fase 3: RPC memory_recall — búsqueda vectorial semántica
-- Usa pgvector cosine distance (<=>). score = 1 - distance (1 = idéntico).

CREATE OR REPLACE FUNCTION memory_recall(
  p_tenant_id        TEXT,
  p_query_embedding  vector(1536),
  p_limit            INT     DEFAULT 10,
  p_categories       TEXT[]  DEFAULT NULL,
  p_min_importance   INT     DEFAULT 1,
  p_min_score        FLOAT   DEFAULT 0.7
)
RETURNS TABLE (
  id           UUID,
  category     TEXT,
  subcategory  TEXT,
  title        TEXT,
  content      TEXT,
  importance   SMALLINT,
  source       TEXT,
  tags         TEXT[],
  metadata     JSONB,
  score        FLOAT,
  created_at   TIMESTAMPTZ
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  WITH ranked AS (
    SELECT
      f.id,
      f.category,
      f.subcategory,
      f.title,
      f.content,
      f.importance,
      f.source,
      f.tags,
      f.metadata,
      1 - (f.embedding <=> p_query_embedding) AS score,
      f.created_at
    FROM memory_facts f
    WHERE
      f.tenant_id = p_tenant_id
      AND (p_categories IS NULL OR f.category = ANY(p_categories))
      AND f.importance >= p_min_importance
      AND f.embedding IS NOT NULL
  )
  SELECT *
  FROM ranked
  WHERE score >= p_min_score
  ORDER BY score DESC
  LIMIT p_limit;
$$;
