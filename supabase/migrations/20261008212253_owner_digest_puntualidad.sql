-- LuisOS: puntualidad del equipo en un rango (resumen del domingo y /semana).
-- Reutiliza owner_digest_turnos día a día: mismos estados y mismo margen de ±10 min.
-- `owner_digest_puntualidad_datos` es interna (permite fijar «ahora» para probar);
-- `owner_digest_puntualidad` es la de LuisOS, con su clave de integración.
CREATE OR REPLACE FUNCTION public.owner_digest_puntualidad_datos(
  p_from date,
  p_to date,
  p_now timestamp DEFAULT (now() AT TIME ZONE 'Europe/Madrid')
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH s AS (
    SELECT d::date AS fecha, x AS shift
    FROM generate_series(p_from, least(p_to, p_now::date), interval '1 day') d
    CROSS JOIN LATERAL jsonb_array_elements(public.owner_digest_turnos(d::date, p_now) -> 'shifts') x
  ), r AS (
    SELECT (shift ->> 'employee_id')::uuid AS id, shift ->> 'employee' AS name, fecha,
           shift ->> 'in_status' AS ins, shift ->> 'out_status' AS outs,
           (shift ->> 'start')::time AS st, (shift ->> 'end')::time AS en, (shift ->> 'clock_in')::time AS ci
    FROM s
    -- Los turnos de hoy que aún no han empezado (+10 min) no cuentan todavía.
    WHERE shift ->> 'in_status' IS NOT NULL
  ), agg AS (
    SELECT id, max(name) AS name,
           count(*) AS shifts,
           count(*) FILTER (WHERE ins = 'ok' AND coalesce(outs, 'ok') = 'ok') AS on_time,
           count(*) FILTER (WHERE ins = 'pronto') AS early_in,
           count(*) FILTER (WHERE ins = 'tarde') AS late,
           coalesce(round(sum(extract(epoch FROM ci - st) / 60) FILTER (WHERE ins = 'tarde')), 0)::int AS late_minutes,
           count(*) FILTER (WHERE ins = 'sin_fichar') AS missing,
           count(*) FILTER (WHERE outs = 'pronto') AS early_out,
           count(*) FILTER (WHERE outs = 'sin_salida') AS open_out,
           round(sum(extract(epoch FROM CASE WHEN en > st THEN en - st ELSE en - st + interval '24 hours' END) / 3600)::numeric, 1) AS shift_hours
    FROM r GROUP BY id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'shifts', a.shifts, 'on_time', a.on_time,
    'late', a.late, 'late_minutes', a.late_minutes, 'early_in', a.early_in, 'missing', a.missing,
    'early_out', a.early_out, 'open_out', a.open_out, 'shift_hours', a.shift_hours,
    -- Horas fichadas (fichajes cerrados) en esos días, con o sin turno.
    'clocked_hours', (SELECT round(coalesce(sum(extract(epoch FROM f.ts_out - f.ts_in)), 0)::numeric / 3600, 1)
                      FROM trabajadores_fichajes f
                      WHERE f.empleado_id = a.id AND f.ts_out IS NOT NULL
                        AND (f.ts_in AT TIME ZONE 'Europe/Madrid')::date BETWEEN p_from AND least(p_to, p_now::date))
  ) ORDER BY a.shifts - a.on_time DESC, a.name), '[]'::jsonb)
  FROM agg a;
$function$;

REVOKE EXECUTE ON FUNCTION public.owner_digest_puntualidad_datos(date, date, timestamp) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.owner_digest_puntualidad(p_key text, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.owner_digest_key_ok(p_key) THEN
    RAISE EXCEPTION 'owner_digest_puntualidad: clave no válida' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN
    RAISE EXCEPTION 'owner_digest_puntualidad: rango no válido (máx. 62 días)' USING ERRCODE = '22023';
  END IF;
  RETURN public.owner_digest_puntualidad_datos(p_from, p_to);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.owner_digest_puntualidad(text, date, date) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_digest_puntualidad(text, date, date) TO anon, service_role;
