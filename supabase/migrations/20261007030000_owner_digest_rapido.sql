-- owner_digest (LuisOS) más rápido: las llamadas de LuisOS entran como `anon`,
-- que tiene un límite de 3 s por consulta, y el resumen llegaba a pasarlo.
-- · El estado del sync se lee directo (antes pasaba por dashboard_kpis_hoy, ~2,5 s).
-- · owner_digest_extra lee la vista de ventas una sola vez para los 7 días.

CREATE OR REPLACE FUNCTION pg_temp.patch_owner_digest_sync() RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  d text := pg_get_functiondef('public.owner_digest(text)'::regprocedure);
  old_sync text := $q$'sync', (SELECT to_jsonb(k) FROM (
      SELECT ultimo_sync_ok AS ok, minutos_desde_sync AS minutes_since, pendiente_mes AS pending_month
      FROM dashboard_kpis_hoy() LIMIT 1) k),$q$;
  new_sync text := $q$'sync', (SELECT jsonb_build_object('ok', s.ok, 'minutes_since', (extract(epoch FROM (now() - s.started_at))::int / 60), 'pending_month', 0)
      FROM manager_holded_sync s ORDER BY s.started_at DESC LIMIT 1),$q$;
BEGIN
  IF position(old_sync in d) = 0 THEN
    IF position('manager_holded_sync s' in d) > 0 THEN RETURN; END IF;
    RAISE EXCEPTION 'bloque de sync no encontrado';
  END IF;
  EXECUTE replace(d, old_sync, new_sync);
END;
$patch$;
SELECT pg_temp.patch_owner_digest_sync();

CREATE OR REPLACE FUNCTION public.owner_digest_extra(p_today date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH inicio AS (
    SELECT max(m.created_at) AS corte FROM tesoreria_movimientos m
    WHERE m.concepto = 'Ajuste de apertura · Inicio 14/07/2026' AND m.ajuste = true
  ), mov AS (
    SELECT m.fecha, CASE WHEN m.tipo = 'entrada' THEN m.importe ELSE -m.importe END AS neto
    FROM tesoreria_movimientos m CROSS JOIN inicio i
    WHERE i.corte IS NULL OR m.created_at > i.corte
  ), dias AS (
    SELECT generate_series(p_today - 6, p_today, interval '1 day')::date AS dia
  ), ventas AS (
    -- Una sola lectura de la vista para los 7 días.
    SELECT v.fecha, sum(v.total) AS total FROM manager_ventas_efectivas v
    WHERE v.tipo = 'VENTA' AND v.fecha BETWEEN p_today - 6 AND p_today GROUP BY v.fecha
  ), caja AS (
    SELECT d.dia, (SELECT coalesce(sum(mo.neto), 0) FROM mov mo WHERE mo.fecha <= d.dia) AS saldo FROM dias d
  ), prev AS (
    SELECT (date_trunc('month', p_today) - interval '1 month')::date AS desde,
           (date_trunc('month', p_today) - interval '1 day')::date AS hasta
  )
  SELECT jsonb_build_object(
    'cash', (SELECT jsonb_build_object(
        'balance', round((SELECT saldo FROM caja WHERE dia = p_today), 2),
        'in_today', round(coalesce((SELECT sum(neto) FROM mov WHERE fecha = p_today AND neto > 0), 0), 2),
        'out_today', round(coalesce((SELECT -sum(neto) FROM mov WHERE fecha = p_today AND neto < 0), 0), 2),
        'last_move', (SELECT max(fecha) FROM tesoreria_movimientos))),
    'series', (SELECT jsonb_agg(jsonb_build_object('date', d.dia, 'ventas', round(coalesce(v.total, 0), 2), 'caja', round(c.saldo, 2)) ORDER BY d.dia)
      FROM dias d LEFT JOIN ventas v ON v.fecha = d.dia JOIN caja c ON c.dia = d.dia),
    'last_month', (SELECT jsonb_build_object(
        'from', p.desde, 'to', p.hasta,
        'ventas', round(r.ventas, 2), 'ventas_delta_pct', r.ventas_delta_pct,
        'margen', round(r.margen, 2), 'margen_pct', r.margen_pct, 'margen_delta_pct', r.margen_delta_pct,
        'compras', round(r.compras, 2), 'docs', r.docs)
      FROM prev p, manager_resumen_comparativo(p.desde, p.hasta) r)
  );
$function$;
