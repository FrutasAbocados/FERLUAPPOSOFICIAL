-- Broker read-only y agregado para la ficha AbocadosOS de Lumo OS.
--
-- Regla de aislamiento:
--   - no expone filas, clientes, facturas ni movimientos de Ferlu;
--   - solo devuelve KPIs operativos agregados;
--   - la cifra de venta usa TOTAL con IVA, igual que los KPIs de AbocadosOS;
--   - una firma SHA-256 permite al colector de Lumo OS invocar el RPC sin
--     guardar una service_role de Ferlu fuera de su proyecto.

CREATE OR REPLACE FUNCTION public.lumo_os_abocados_snapshot(
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
  year_start date;
  result jsonb;
BEGIN
  IF p_token IS NULL
     OR encode(extensions.digest(p_token, 'sha256'), 'hex') IS DISTINCT FROM expected_token_hash THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  month_start := date_trunc('month', local_day)::date;
  year_start := date_trunc('year', local_day)::date;

  WITH sales AS (
    SELECT
      count(*) FILTER (WHERE sale.fecha = local_day)::integer AS today_count,
      COALESCE(sum(sale.total) FILTER (WHERE sale.fecha = local_day), 0)::numeric(14, 2)
        AS today_eur,
      count(*) FILTER (
        WHERE sale.fecha BETWEEN month_start AND local_day
      )::integer AS month_count,
      COALESCE(sum(sale.total) FILTER (
        WHERE sale.fecha BETWEEN month_start AND local_day
      ), 0)::numeric(14, 2) AS month_eur,
      count(*) FILTER (
        WHERE sale.fecha BETWEEN year_start AND local_day
      )::integer AS year_count,
      COALESCE(sum(sale.total) FILTER (
        WHERE sale.fecha BETWEEN year_start AND local_day
      ), 0)::numeric(14, 2) AS year_eur
    FROM public.manager_ventas_efectivas sale
  ),
  agent_usage AS (
    SELECT
      count(*)::integer AS calls,
      COALESCE(sum(interaction.input_tokens), 0)::bigint AS input_tokens,
      COALESCE(sum(interaction.output_tokens), 0)::bigint AS output_tokens,
      (
        COALESCE(sum(interaction.cache_read_tokens), 0)
        + COALESCE(sum(interaction.cache_write_tokens), 0)
      )::bigint AS cached_tokens,
      COALESCE(sum(interaction.cost_eur), 0)::numeric(12, 6) AS cost_eur,
      count(*) FILTER (WHERE interaction.success IS FALSE)::integer AS failures
    FROM public.agent_interactions interaction
    WHERE interaction.created_at >= month_start::timestamp AT TIME ZONE 'Europe/Madrid'
      AND interaction.created_at < (local_day + 1)::timestamp AT TIME ZONE 'Europe/Madrid'
  ),
  briefing_usage AS (
    SELECT
      count(*)::integer AS calls,
      COALESCE(sum(briefing.tokens_in), 0)::bigint AS input_tokens,
      COALESCE(sum(briefing.tokens_out), 0)::bigint AS output_tokens,
      COALESCE(sum(briefing.coste_eur), 0)::numeric(12, 6) AS cost_eur
    FROM public.dashboard_briefing_diario briefing
    WHERE briefing.fecha BETWEEN month_start AND local_day
  ),
  advisor_usage AS (
    SELECT
      count(*)::integer AS calls,
      COALESCE(sum(advisor.tokens_in), 0)::bigint AS input_tokens,
      COALESCE(sum(advisor.tokens_out), 0)::bigint AS output_tokens
    FROM public.manager_asesor_ia advisor
    WHERE advisor.fecha BETWEEN month_start AND local_day
  ),
  operations AS (
    SELECT
      (
        SELECT count(*)::integer
        FROM public.manager_facturas document
        WHERE document.fecha BETWEEN month_start AND local_day
      ) AS documents_month,
      (
        SELECT count(*)::integer
        FROM public.pedidos_wa orders
        WHERE orders.fecha BETWEEN month_start AND local_day
      ) AS whatsapp_orders_month,
      (
        SELECT count(*)::integer
        FROM public.events event
        WHERE event.created_at >= month_start::timestamp AT TIME ZONE 'Europe/Madrid'
          AND event.created_at < (local_day + 1)::timestamp AT TIME ZONE 'Europe/Madrid'
      ) AS events_month,
      (
        SELECT count(*)::integer
        FROM public.events event
        WHERE event.created_at >= month_start::timestamp AT TIME ZONE 'Europe/Madrid'
          AND event.created_at < (local_day + 1)::timestamp AT TIME ZONE 'Europe/Madrid'
          AND event.status IN ('failed', 'error')
      ) AS failed_events_month,
      (
        SELECT count(*)::integer
        FROM public.trabajadores_fichajes clock_in
        WHERE clock_in.ts_in >= month_start::timestamp AT TIME ZONE 'Europe/Madrid'
          AND clock_in.ts_in < (local_day + 1)::timestamp AT TIME ZONE 'Europe/Madrid'
      ) AS clock_ins_month,
      (
        SELECT count(*)::integer
        FROM public.incidencias incident
        WHERE incident.fecha BETWEEN month_start AND local_day
      ) AS incidents_month,
      (
        SELECT count(*)::integer
        FROM public.incidencias incident
        WHERE incident.estado NOT IN ('resuelta', 'cerrada')
      ) AS open_incidents,
      (
        SELECT count(*)::integer
        FROM cron.job job
        WHERE job.active IS TRUE
      ) AS active_cron_jobs
  )
  SELECT jsonb_build_object(
    'ok', true,
    'app_slug', 'abocados',
    'snapshot_date', local_day,
    'period_month', month_start,
    'source', 'ferlu_operational_broker_v1',
    'sales_today_eur', sales.today_eur,
    'sales_month_eur', sales.month_eur,
    'sales_year_eur', sales.year_eur,
    'sales_today_count', sales.today_count,
    'sales_month_count', sales.month_count,
    'sales_year_count', sales.year_count,
    'documents_month', operations.documents_month,
    'whatsapp_orders_month', operations.whatsapp_orders_month,
    'events_month', operations.events_month,
    'failed_events_month', operations.failed_events_month,
    'clock_ins_month', operations.clock_ins_month,
    'incidents_month', operations.incidents_month,
    'open_incidents', operations.open_incidents,
    'active_cron_jobs', operations.active_cron_jobs,
    'active_edge_functions', 20,
    'ai_calls_month',
      agent_usage.calls + briefing_usage.calls + advisor_usage.calls,
    'ai_input_tokens',
      agent_usage.input_tokens + briefing_usage.input_tokens + advisor_usage.input_tokens,
    'ai_output_tokens',
      agent_usage.output_tokens + briefing_usage.output_tokens + advisor_usage.output_tokens,
    'ai_cached_tokens', agent_usage.cached_tokens,
    'ai_cost_eur', agent_usage.cost_eur + briefing_usage.cost_eur,
    'ai_cost_scope', 'partial',
    'ocr_calls', NULL,
    'ocr_failed', NULL,
    'ocr_cost_scope', 'unavailable',
    'ai_breakdown', jsonb_build_object(
      'agent_chat_and_events', jsonb_build_object(
        'calls', agent_usage.calls,
        'input_tokens', agent_usage.input_tokens,
        'output_tokens', agent_usage.output_tokens,
        'cached_tokens', agent_usage.cached_tokens,
        'cost_eur', agent_usage.cost_eur,
        'failures', agent_usage.failures
      ),
      'dashboard_briefings', jsonb_build_object(
        'calls', briefing_usage.calls,
        'input_tokens', briefing_usage.input_tokens,
        'output_tokens', briefing_usage.output_tokens,
        'cost_eur', briefing_usage.cost_eur
      ),
      'manager_advisor', jsonb_build_object(
        'calls', advisor_usage.calls,
        'input_tokens', advisor_usage.input_tokens,
        'output_tokens', advisor_usage.output_tokens,
        'cost_eur', NULL,
        'cost_scope', 'unavailable'
      )
    ),
    'generated_at', now()
  )
  INTO result
  FROM sales, agent_usage, briefing_usage, advisor_usage, operations;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.lumo_os_abocados_snapshot(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lumo_os_abocados_snapshot(text, date) TO anon, service_role;

COMMENT ON FUNCTION public.lumo_os_abocados_snapshot(text, date) IS
  'Broker agregado read-only para Lumo OS. No expone filas ni integra la contabilidad Ferlu en LumoTech.';
