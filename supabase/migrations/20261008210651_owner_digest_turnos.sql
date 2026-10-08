-- LuisOS: avisar cuando alguien no ficha dentro de su turno (±10 min).
-- Para cada turno de hoy con horario (sin libre ni vacaciones) devuelve la
-- entrada y la salida fichadas y su estado:
--   in_status:  sin_fichar | tarde | pronto | ok   (null hasta inicio + 10 min)
--   out_status: sin_salida | tarde | pronto | ok   (null hasta fin + 10 min)
-- La salida solo se juzga pasado el fin del turno: un fichaje cerrado antes
-- puede ser una pausa. LuisOS convierte cada estado distinto de ok en un aviso.
CREATE OR REPLACE FUNCTION public.owner_digest_turnos(
  p_today date,
  p_now timestamp DEFAULT (now() AT TIME ZONE 'Europe/Madrid')
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH t AS (
    SELECT t.empleado_id, e.nombre, t.tipo::text AS tipo,
           p_today + t.hora_inicio AS ini,
           p_today + t.hora_fin + CASE WHEN t.hora_fin IS NOT NULL AND t.hora_fin <= t.hora_inicio THEN interval '1 day' ELSE interval '0' END AS fin
    FROM turnos t JOIN empleados e ON e.id = t.empleado_id
    WHERE t.fecha = p_today AND e.activo AND t.hora_inicio IS NOT NULL
      AND t.tipo::text NOT IN ('libre', 'vacaciones')
      AND NOT EXISTS (SELECT 1 FROM trabajadores_vacaciones v
                      WHERE v.empleado_id = t.empleado_id AND v.estado IN ('aprobado', 'disfrutado')
                        AND p_today BETWEEN v.fecha_inicio AND v.fecha_fin)
  ), f AS (
    -- Fichajes del turno: los que empiezan desde 4 h antes hasta su fin.
    SELECT t.*, x.entrada, x.salida, coalesce(x.abierto, false) AS abierto
    FROM t LEFT JOIN LATERAL (
      SELECT min(fi.ts_in AT TIME ZONE 'Europe/Madrid') AS entrada,
             max(fi.ts_out AT TIME ZONE 'Europe/Madrid') AS salida,
             bool_or(fi.ts_out IS NULL) AS abierto
      FROM trabajadores_fichajes fi
      WHERE fi.empleado_id = t.empleado_id
        AND fi.ts_in AT TIME ZONE 'Europe/Madrid' >= t.ini - interval '4 hours'
        AND fi.ts_in AT TIME ZONE 'Europe/Madrid' < coalesce(t.fin, t.ini + interval '12 hours')
    ) x ON true
  )
  SELECT jsonb_build_object('shifts', coalesce(jsonb_agg(jsonb_build_object(
    'employee_id', f.empleado_id,
    'employee', f.nombre,
    'type', f.tipo,
    'date', p_today,
    'start', to_char(f.ini, 'HH24:MI'),
    'end', to_char(f.fin, 'HH24:MI'),
    'clock_in', to_char(f.entrada, 'HH24:MI'),
    'clock_out', CASE WHEN f.abierto THEN NULL ELSE to_char(f.salida, 'HH24:MI') END,
    'in_status', CASE
      WHEN f.entrada IS NULL THEN CASE WHEN p_now >= f.ini + interval '10 minutes' THEN 'sin_fichar' END
      WHEN f.entrada > f.ini + interval '10 minutes' THEN 'tarde'
      WHEN f.entrada < f.ini - interval '10 minutes' THEN 'pronto'
      ELSE 'ok' END,
    'out_status', CASE
      WHEN f.entrada IS NULL OR f.fin IS NULL OR p_now < f.fin + interval '10 minutes' THEN NULL
      WHEN f.abierto THEN 'sin_salida'
      WHEN f.salida > f.fin + interval '10 minutes' THEN 'tarde'
      WHEN f.salida < f.fin - interval '10 minutes' THEN 'pronto'
      ELSE 'ok' END
  ) ORDER BY f.ini, f.nombre), '[]'::jsonb))
  FROM f;
$function$;

REVOKE EXECUTE ON FUNCTION public.owner_digest_turnos(date, timestamp) FROM PUBLIC, anon, authenticated;

-- owner_digest_extra igual que antes, más los turnos de hoy.
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
  ) || public.owner_digest_turnos(p_today);
$function$;
