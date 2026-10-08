-- LuisOS: avisar antes de que falten turnos.
--   last_date: último día con turnos cargados (para avisar cuando se acaba el plan).
--   uncovered: días de lunes a sábado de la semana que viene sin nadie de turno,
--              solo desde el primer día con turnos cargados.
--   in_use:    hay turnos recientes o futuros (si no, no se avisa de nada).
CREATE OR REPLACE FUNCTION public.owner_digest_turnos_futuro(p_today date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH r AS (
    SELECT min(fecha) FILTER (WHERE fecha >= p_today - 30) AS first_date, max(fecha) AS last_date,
           bool_or(fecha >= p_today - 30) AS in_use
    FROM turnos
  ), days AS (
    SELECT d::date AS dia FROM generate_series(p_today + 1, p_today + 7, interval '1 day') d
    WHERE extract(isodow FROM d) <= 6
  )
  SELECT jsonb_build_object('shifts_ahead', jsonb_build_object(
    'in_use', coalesce(r.in_use, false),
    'last_date', r.last_date,
    'uncovered', coalesce((
      SELECT jsonb_agg(days.dia ORDER BY days.dia) FROM days
      WHERE r.first_date IS NOT NULL AND days.dia >= r.first_date
        AND NOT EXISTS (SELECT 1 FROM turnos t JOIN empleados e ON e.id = t.empleado_id
                        WHERE t.fecha = days.dia AND e.activo AND t.hora_inicio IS NOT NULL
                          AND t.tipo::text NOT IN ('libre', 'vacaciones'))
    ), '[]'::jsonb)))
  FROM r;
$function$;

REVOKE EXECUTE ON FUNCTION public.owner_digest_turnos_futuro(date) FROM PUBLIC, anon, authenticated;

-- owner_digest_extra igual que antes, más los turnos que vienen.
CREATE OR REPLACE FUNCTION public.owner_digest_extra(p_today date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
    SELECT v.fecha, sum(v.total) AS total FROM owner_digest_ventas_efectivas v
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
      FROM prev p, owner_digest_resumen(p.desde, p.hasta) r)
  ) || public.owner_digest_turnos(p_today) || public.owner_digest_turnos_futuro(p_today);
$function$;
