-- Desglose OCR para el broker Lumo OS.
-- Solo cuenta telemetría registrada desde el despliegue que instrumenta
-- parsear-factura-proveedor; el histórico anterior permanece explícitamente
-- fuera de cobertura.

CREATE OR REPLACE FUNCTION public.lumo_os_abocados_ocr_snapshot(
  p_token text,
  p_as_of date DEFAULT ((now() AT TIME ZONE 'Europe/Madrid')::date)
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  expected_token_hash constant text :=
    'e9b79dd34ad17e290430711371a2716e31856d1d14e6b8b55d276603e6763bf3';
  local_day date := COALESCE(p_as_of, (now() AT TIME ZONE 'Europe/Madrid')::date);
  month_start date;
  result jsonb;
BEGIN
  IF p_token IS NULL
     OR encode(extensions.digest(p_token, 'sha256'), 'hex') IS DISTINCT FROM expected_token_hash THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  month_start := date_trunc('month', local_day)::date;

  SELECT jsonb_build_object(
    'ok', true,
    'ocr_calls', count(*)::integer,
    'ocr_failed', count(*) FILTER (WHERE interaction.success IS FALSE)::integer,
    'ocr_input_tokens', COALESCE(sum(interaction.input_tokens), 0)::bigint,
    'ocr_output_tokens', COALESCE(sum(interaction.output_tokens), 0)::bigint,
    'ocr_cached_tokens',
      (
        COALESCE(sum(interaction.cache_read_tokens), 0)
        + COALESCE(sum(interaction.cache_write_tokens), 0)
      )::bigint,
    'ocr_cost_eur', COALESCE(sum(interaction.cost_eur), 0)::numeric(12, 6),
    'ocr_cost_scope', 'partial',
    'ocr_trace_started_at', min(interaction.created_at),
    'ocr_last_at', max(interaction.created_at)
  )
  INTO result
  FROM public.agent_interactions interaction
  WHERE interaction.agent_name = 'parsear-factura-proveedor'
    AND interaction.event_type = 'invoice_ocr'
    AND interaction.created_at >= month_start::timestamp AT TIME ZONE 'Europe/Madrid'
    AND interaction.created_at < (local_day + 1)::timestamp AT TIME ZONE 'Europe/Madrid';

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.lumo_os_abocados_ocr_snapshot(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lumo_os_abocados_ocr_snapshot(text, date)
  TO anon, service_role;

COMMENT ON FUNCTION public.lumo_os_abocados_ocr_snapshot(text, date) IS
  'Telemetría OCR agregada desde su fecha de instrumentación; no reconstruye ni estima el histórico.';
