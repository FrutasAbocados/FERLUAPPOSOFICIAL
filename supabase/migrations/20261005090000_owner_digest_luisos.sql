-- Contrato de solo lectura para LuisOS (capa personal del propietario, LumoTech).
--
-- LuisOS no comparte base de datos ni service_role con Ferlu: llama a esta RPC
-- con la clave publicable de Ferlu y una clave de integración propia. Aquí solo se
-- guarda el SHA-256 de esa clave. La función devuelve un resumen para el dueño
-- reutilizando las RPC del dashboard; no escribe nada.

CREATE TABLE IF NOT EXISTS public.integration_access_keys (
  name text PRIMARY KEY CHECK (name ~ '^[a-z][a-z0-9_-]{2,40}$'),
  key_sha256 text NOT NULL CHECK (key_sha256 ~ '^[0-9a-f]{64}$'),
  scope text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

COMMENT ON TABLE public.integration_access_keys IS
  'Claves de integraciones externas de solo lectura. Solo el hash; sin políticas RLS: nadie la lee por API, solo funciones security definer.';

ALTER TABLE public.integration_access_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_access_keys FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.owner_digest(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_month_start date := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
  v_ok boolean;
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

  RETURN jsonb_build_object(
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
END;
$$;

REVOKE ALL ON FUNCTION public.owner_digest(text) FROM PUBLIC;
-- anon: LuisOS llama con la clave publicable; la clave de integración es la autorización real.
GRANT EXECUTE ON FUNCTION public.owner_digest(text) TO anon, service_role;

COMMENT ON FUNCTION public.owner_digest(text) IS
  'Resumen de propietario para LuisOS. Solo lectura; exige clave de integración (hash en integration_access_keys).';
