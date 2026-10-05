-- owner_digest (LuisOS) · controles diarios que pidió Luis:
--   reconciliation: el último día con repartos, lo facturado (facturas + albaranes
--                   de Holded) frente a lo que cerraron los chicos, cliente a cliente.
--   clock:          fichajes abiertos de más de 12 h (no desficharon) y quien suele
--                   fichar y hoy no lo ha hecho (de lunes a sábado, desde las 10:30,
--                   sin vacaciones aprobadas).
--   staff_credit:   créditos de fruta y verdura de los trabajadores de los dos últimos días.
-- Solo lectura; misma clave de integración y mismo contrato que antes.

CREATE OR REPLACE FUNCTION public.owner_digest(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now_local timestamp := now() AT TIME ZONE 'Europe/Madrid';
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_month_start date := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
  v_ok boolean;
  v_base jsonb;
  v_rec_day date;
  v_reconciliation jsonb;
BEGIN
  UPDATE public.integration_access_keys
     SET last_used_at = now()
   WHERE name = 'luisos'
     AND active
     AND scope = 'owner_digest'
     AND key_sha256 = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
  RETURNING true INTO v_ok;

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'owner_digest: clave no válida' USING ERRCODE = '42501';
  END IF;

  v_base := jsonb_build_object(
    'generated_at', now(),
    'today', v_today,
    'sync', (SELECT to_jsonb(k) FROM (
      SELECT ultimo_sync_ok AS ok, minutos_desde_sync AS minutes_since, pendiente_mes AS pending_month
      FROM dashboard_kpis_hoy() LIMIT 1) k),
    'month', (SELECT to_jsonb(m) FROM (
      SELECT ventas, ventas_ant, ventas_delta_pct, margen, margen_pct, margen_delta_pct, comp_from, comp_to
      FROM manager_resumen_comparativo(v_month_start, v_today) LIMIT 1) m),
    'week', (SELECT to_jsonb(w) FROM (
      SELECT ventas, ventas_ant, ventas_delta_pct, margen, margen_pct, margen_delta_pct
      FROM manager_resumen_comparativo(v_today - 6, v_today) LIMIT 1) w),
    'debtors', coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM (
      SELECT cliente_id, nombre, round(pendiente, 2) AS pending, round(vencido, 2) AS overdue
      FROM dashboard_top_deudores() WHERE vencido >= 300 ORDER BY vencido DESC LIMIT 8) d), '[]'::jsonb),
    'rising_costs', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM (
      SELECT product_id, nombre, round(coste_anterior, 4) AS cost_before, round(coste_actual, 4) AS cost_now,
             variacion_pct AS change_pct, ultima_compra AS last_purchase
      FROM dashboard_costes_subiendo(14, 20) ORDER BY variacion_pct DESC LIMIT 6) c), '[]'::jsonb),
    'churn_risk', coalesce((SELECT jsonb_agg(to_jsonb(f)) FROM (
      SELECT contact_name_canon AS client, severidad AS severity, motivos AS reasons, dias_sin_pedir AS days_without_order,
             cadencia_dias AS cadence_days, round(valor_perdido_estimado) AS lost_value_estimate, ultima_compra AS last_order
      FROM dashboard_clientes_riesgo_fuga()
      WHERE severidad IN ('critica', 'alta') AND coalesce(valor_perdido_estimado, 0) >= 150
      ORDER BY valor_perdido_estimado DESC NULLS LAST LIMIT 6) f), '[]'::jsonb),
    'expected_orders', coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM (
      SELECT contact_name_canon AS client, proxima_esperada AS expected_on, dias_para AS days_until,
             ticket_medio AS avg_ticket, confianza AS confidence
      FROM manager_pedidos_proximos()
      WHERE prioridad = 'urgente' AND confianza = 'alta' AND dias_para BETWEEN -14 AND 0
      ORDER BY ticket_medio DESC NULLS LAST LIMIT 6) e), '[]'::jsonb),
    'incidents', coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM (
      SELECT id, contact_name_canon AS client, fecha AS date, tipo AS kind, left(descripcion, 200) AS description
      FROM incidencias WHERE estado = 'pendiente' ORDER BY fecha LIMIT 10) i), '[]'::jsonb),
    'unreviewed_routes', (SELECT jsonb_build_object('count', count(*), 'oldest', min(fecha))
      FROM repartos_jornada WHERE NOT coalesce(revisado, false) AND fecha > v_today - 45),
    'pending_vacations', coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM (
      SELECT v.id, e.nombre AS employee, v.fecha_inicio AS starts_on, v.dias AS days
      FROM trabajadores_vacaciones v JOIN empleados e ON e.id = v.empleado_id
      WHERE v.estado = 'pendiente' ORDER BY v.fecha_inicio LIMIT 10) v), '[]'::jsonb),
    'fixed_costs_missing', coalesce((SELECT jsonb_agg(nombre ORDER BY nombre)
      FROM gastos_fijos WHERE activo AND importe IS NULL), '[]'::jsonb)
  );

  -- Cuadre: último día cerrado (anterior a hoy) con repartos en la última semana.
  SELECT max(fecha) INTO v_rec_day FROM repartos_jornada WHERE fecha < v_today AND fecha >= v_today - 7;
  IF v_rec_day IS NOT NULL THEN
    WITH v AS (
      SELECT contact_id, max(contact_name) AS nombre, sum(total) AS facturado
      FROM manager_ventas_efectivas WHERE tipo = 'VENTA' AND fecha = v_rec_day GROUP BY contact_id
    ), c AS (
      SELECT l.contact_id, max(l.contact_nombre) AS nombre, sum(l.importe) AS cierre
      FROM repartos_jornada j JOIN repartos_jornada_lineas l ON l.jornada_id = j.id
      WHERE j.fecha = v_rec_day GROUP BY l.contact_id
    ), x AS (
      SELECT coalesce(c.nombre, v.nombre, 'Sin nombre') AS nombre, coalesce(v.facturado, 0) AS facturado, coalesce(c.cierre, 0) AS cierre
      FROM v FULL JOIN c ON c.contact_id = v.contact_id
    )
    SELECT jsonb_build_object(
      'date', v_rec_day,
      'billed', round(sum(facturado), 2),
      'closed', round(sum(cierre), 2),
      'diff', round(sum(cierre) - sum(facturado), 2),
      'clients', coalesce((
        SELECT jsonb_agg(jsonb_build_object('name', y.nombre, 'billed', round(y.facturado, 2), 'closed', round(y.cierre, 2), 'diff', round(y.cierre - y.facturado, 2)))
        FROM (SELECT * FROM x WHERE abs(cierre - facturado) >= 1 ORDER BY abs(cierre - facturado) DESC LIMIT 10) y), '[]'::jsonb)
    ) INTO v_reconciliation FROM x;
  END IF;

  RETURN v_base || jsonb_build_object(
    'reconciliation', v_reconciliation,
    'clock', jsonb_build_object(
      'open', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'employee', e.nombre, 'since', f.ts_in) ORDER BY f.ts_in)
        FROM trabajadores_fichajes f JOIN empleados e ON e.id = f.empleado_id
        WHERE f.ts_out IS NULL AND f.ts_in < now() - interval '12 hours' AND f.ts_in > now() - interval '7 days'), '[]'::jsonb),
      'missing', CASE WHEN extract(isodow FROM v_today) <= 6 AND v_now_local::time >= time '10:30' THEN coalesce((
        SELECT jsonb_agg(e.nombre ORDER BY e.nombre) FROM empleados e
        WHERE e.activo
          -- Suele fichar: al menos 3 días distintos de los últimos 8.
          AND (SELECT count(DISTINCT (f.ts_in AT TIME ZONE 'Europe/Madrid')::date) FROM trabajadores_fichajes f
               WHERE f.empleado_id = e.id AND f.ts_in >= now() - interval '8 days'
                 AND (f.ts_in AT TIME ZONE 'Europe/Madrid')::date < v_today) >= 3
          AND NOT EXISTS (SELECT 1 FROM trabajadores_fichajes f WHERE f.empleado_id = e.id AND (f.ts_in AT TIME ZONE 'Europe/Madrid')::date = v_today)
          AND NOT EXISTS (SELECT 1 FROM trabajadores_vacaciones vv WHERE vv.empleado_id = e.id AND vv.estado IN ('aprobado', 'disfrutado') AND v_today BETWEEN vv.fecha_inicio AND vv.fecha_fin)
          AND NOT EXISTS (SELECT 1 FROM turnos t WHERE t.empleado_id = e.id AND t.fecha = v_today AND t.tipo::text = 'libre')
      ), '[]'::jsonb) ELSE '[]'::jsonb END
    ),
    'staff_credit', coalesce((SELECT jsonb_agg(to_jsonb(k) ORDER BY k.date DESC) FROM (
      SELECT cf.id, e.nombre AS employee, cf.fecha AS date, round(cf.total, 2) AS total, cf.estado AS status
      FROM trabajadores_credito_facturas cf JOIN empleados e ON e.id = cf.empleado_id
      WHERE cf.fecha >= v_today - 2 ORDER BY cf.fecha DESC LIMIT 10) k), '[]'::jsonb)
  );
END;
$function$;
