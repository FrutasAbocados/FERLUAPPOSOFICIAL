-- Equipo (LuisOS) v2: vacaciones como las cuenta AbocadosOS (días que quedan),
-- hoy (entrada y salida) y horas de esta semana. Y la ficha de cada persona.
CREATE OR REPLACE FUNCTION public.owner_digest_equipo(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
  v_week date := date_trunc('week', (now() AT TIME ZONE 'Europe/Madrid'))::date;
BEGIN
  IF NOT public.owner_digest_key_ok(p_key) THEN
    RAISE EXCEPTION 'owner_digest_equipo: clave no válida' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', e.id, 'name', e.nombre, 'role', e.puesto,
    'clock', jsonb_build_object(
      'today_in', (SELECT min(f.ts_in) FROM trabajadores_fichajes f WHERE f.empleado_id = e.id AND (f.ts_in AT TIME ZONE 'Europe/Madrid')::date = v_today),
      'today_out', (SELECT max(f.ts_out) FROM trabajadores_fichajes f WHERE f.empleado_id = e.id AND (f.ts_in AT TIME ZONE 'Europe/Madrid')::date = v_today),
      'open', EXISTS (SELECT 1 FROM trabajadores_fichajes f WHERE f.empleado_id = e.id AND f.ts_out IS NULL AND f.ts_in > now() - interval '24 hours'),
      'week_hours', (SELECT round(coalesce(sum(extract(epoch FROM (coalesce(f.ts_out, least(now(), f.ts_in + interval '12 hours')) - f.ts_in)) / 3600), 0)::numeric, 1)
        FROM trabajadores_fichajes f WHERE f.empleado_id = e.id AND (f.ts_in AT TIME ZONE 'Europe/Madrid')::date >= v_week),
      'week_days', (SELECT count(DISTINCT (f.ts_in AT TIME ZONE 'Europe/Madrid')::date) FROM trabajadores_fichajes f WHERE f.empleado_id = e.id AND (f.ts_in AT TIME ZONE 'Europe/Madrid')::date >= v_week)),
    'overtime', jsonb_build_object(
      'month', (SELECT round(coalesce(sum(h.horas), 0), 2) FROM trabajadores_horas_extras h WHERE h.empleado_id = e.id AND h.fecha >= v_month),
      'pending', (SELECT round(coalesce(sum(h.horas), 0), 2) FROM trabajadores_horas_extras h WHERE h.empleado_id = e.id AND h.aprobacion IN ('solicitado', 'pendiente'))),
    'vacation', (SELECT jsonb_build_object(
        'total', r.dias_anuales_efectivos, 'taken', r.disfrutados, 'approved', r.aprobados, 'pending', r.pendientes, 'remaining', r.restantes,
        'next', (SELECT jsonb_build_object('from', v.fecha_inicio, 'to', v.fecha_fin, 'days', v.dias, 'status', v.estado) FROM trabajadores_vacaciones v
          WHERE v.empleado_id = e.id AND v.fecha_fin >= v_today AND v.estado IN ('aprobado', 'pendiente') ORDER BY v.fecha_inicio LIMIT 1))
      FROM trabajadores_vacaciones_resumen_anual(NULL) r WHERE r.empleado_id = e.id),
    'credit', jsonb_build_object(
      'month', (SELECT round(coalesce(sum(c.total), 0), 2) FROM trabajadores_credito_facturas c WHERE c.empleado_id = e.id AND c.fecha >= v_month AND c.estado <> 'rechazada'),
      'limit', e.limite_credito_mensual)
  ) ORDER BY e.orden NULLS LAST, e.nombre) FROM empleados e WHERE e.activo), '[]'::jsonb);
END;
$function$;

-- La ficha de una persona: fichajes de 14 días, horas extra, vacaciones del año y crédito del mes.
CREATE OR REPLACE FUNCTION public.owner_digest_empleado(p_key text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
BEGIN
  IF NOT public.owner_digest_key_ok(p_key) THEN
    RAISE EXCEPTION 'owner_digest_empleado: clave no válida' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT jsonb_build_object(
    'id', e.id, 'name', e.nombre, 'role', e.puesto, 'since', e.fecha_alta,
    'days', coalesce((SELECT jsonb_agg(jsonb_build_object('date', d.dia, 'in', d.entrada, 'out', d.salida, 'hours', d.horas, 'open', d.abierto) ORDER BY d.dia DESC) FROM (
        SELECT (f.ts_in AT TIME ZONE 'Europe/Madrid')::date AS dia, min(f.ts_in) AS entrada, max(f.ts_out) AS salida, bool_or(f.ts_out IS NULL) AS abierto,
               round(sum(extract(epoch FROM (coalesce(f.ts_out, least(now(), f.ts_in + interval '12 hours')) - f.ts_in)) / 3600)::numeric, 1) AS horas
        FROM trabajadores_fichajes f WHERE f.empleado_id = e.id AND f.ts_in >= (v_today - 13)::timestamp AT TIME ZONE 'Europe/Madrid'
        GROUP BY 1) d), '[]'::jsonb),
    'overtime', coalesce((SELECT jsonb_agg(jsonb_build_object('date', h.fecha, 'hours', h.horas, 'mode', h.modo, 'approval', h.aprobacion, 'reason', left(h.motivo, 160)) ORDER BY h.fecha DESC)
      FROM (SELECT * FROM trabajadores_horas_extras WHERE empleado_id = e.id AND fecha >= v_today - 60 ORDER BY fecha DESC LIMIT 20) h), '[]'::jsonb),
    'vacation', (SELECT jsonb_build_object('total', r.dias_anuales_efectivos, 'taken', r.disfrutados, 'approved', r.aprobados, 'pending', r.pendientes, 'remaining', r.restantes)
      FROM trabajadores_vacaciones_resumen_anual(NULL) r WHERE r.empleado_id = e.id),
    'vacations', coalesce((SELECT jsonb_agg(jsonb_build_object('from', v.fecha_inicio, 'to', v.fecha_fin, 'days', v.dias, 'status', v.estado, 'note', left(v.nota, 120)) ORDER BY v.fecha_inicio DESC)
      FROM trabajadores_vacaciones v WHERE v.empleado_id = e.id AND v.fecha_inicio >= date_trunc('year', v_today)), '[]'::jsonb),
    'credit', coalesce((SELECT jsonb_agg(jsonb_build_object('date', c.fecha, 'total', round(c.total, 2), 'status', c.estado) ORDER BY c.fecha DESC)
      FROM trabajadores_credito_facturas c WHERE c.empleado_id = e.id AND c.fecha >= date_trunc('month', v_today)), '[]'::jsonb),
    'credit_limit', e.limite_credito_mensual
  ) FROM empleados e WHERE e.id = p_id AND e.activo);
END;
$function$;
REVOKE ALL ON FUNCTION public.owner_digest_empleado(text, uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_digest_empleado(text, uuid) TO anon;
