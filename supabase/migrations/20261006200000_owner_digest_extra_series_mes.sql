-- owner_digest_extra (LuisOS): tendencia de 7 días (ventas y caja) para los
-- minigráficos de Hoy y el mes anterior completo para el cierre de mes.
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
  ), prev AS (
    SELECT (date_trunc('month', p_today) - interval '1 month')::date AS desde,
           (date_trunc('month', p_today) - interval '1 day')::date AS hasta
  )
  SELECT jsonb_build_object(
    'cash', (SELECT jsonb_build_object(
        'balance', round(k.saldo_total, 2),
        'in_today', round(k.entradas_periodo, 2),
        'out_today', round(k.salidas_periodo, 2),
        'last_move', (SELECT max(fecha) FROM tesoreria_movimientos))
      FROM tesoreria_kpis(p_today, p_today) k),
    'series', (SELECT jsonb_agg(jsonb_build_object(
        'date', d.dia,
        'ventas', round(coalesce((SELECT sum(v.total) FROM manager_ventas_efectivas v WHERE v.tipo = 'VENTA' AND v.fecha = d.dia), 0), 2),
        'caja', round(coalesce((SELECT sum(mo.neto) FROM mov mo WHERE mo.fecha <= d.dia), 0), 2)) ORDER BY d.dia)
      FROM dias d),
    'last_month', (SELECT jsonb_build_object(
        'from', p.desde, 'to', p.hasta,
        'ventas', round(r.ventas, 2), 'ventas_delta_pct', r.ventas_delta_pct,
        'margen', round(r.margen, 2), 'margen_pct', r.margen_pct, 'margen_delta_pct', r.margen_delta_pct,
        'compras', round(r.compras, 2), 'docs', r.docs)
      FROM prev p, manager_resumen_comparativo(p.desde, p.hasta) r)
  );
$function$;
