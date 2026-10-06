-- owner_digest_equipo / owner_digest_proveedor (LuisOS): fichas de solo lectura
-- con la misma clave que owner_digest.

CREATE OR REPLACE FUNCTION public.owner_digest_key_ok(p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.integration_access_keys
    WHERE name = 'luisos' AND active AND scope = 'owner_digest'
      AND key_sha256 = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex'));
$function$;
REVOKE ALL ON FUNCTION public.owner_digest_key_ok(text) FROM PUBLIC, anon, authenticated;

-- El equipo: una ficha por persona activa (este mes).
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
BEGIN
  IF NOT public.owner_digest_key_ok(p_key) THEN
    RAISE EXCEPTION 'owner_digest_equipo: clave no válida' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', e.id, 'name', e.nombre, 'role', e.puesto,
    'clock', jsonb_build_object(
      'today_in', (SELECT min(f.ts_in) FROM trabajadores_fichajes f WHERE f.empleado_id = e.id AND (f.ts_in AT TIME ZONE 'Europe/Madrid')::date = v_today),
      'open', EXISTS (SELECT 1 FROM trabajadores_fichajes f WHERE f.empleado_id = e.id AND f.ts_out IS NULL AND f.ts_in > now() - interval '24 hours'),
      'hours_month', (SELECT round(coalesce(sum(extract(epoch FROM (coalesce(f.ts_out, least(now(), f.ts_in + interval '12 hours')) - f.ts_in)) / 3600), 0)::numeric, 1)
        FROM trabajadores_fichajes f WHERE f.empleado_id = e.id AND f.ts_in >= v_month),
      'days_month', (SELECT count(DISTINCT (f.ts_in AT TIME ZONE 'Europe/Madrid')::date) FROM trabajadores_fichajes f WHERE f.empleado_id = e.id AND f.ts_in >= v_month)),
    'overtime', jsonb_build_object(
      'month', (SELECT round(coalesce(sum(h.horas), 0), 2) FROM trabajadores_horas_extras h WHERE h.empleado_id = e.id AND h.fecha >= v_month),
      'pending', (SELECT round(coalesce(sum(h.horas), 0), 2) FROM trabajadores_horas_extras h WHERE h.empleado_id = e.id AND h.aprobacion IN ('solicitado', 'pendiente'))),
    'vacation', jsonb_build_object(
      'pending', (SELECT count(*) FROM trabajadores_vacaciones v WHERE v.empleado_id = e.id AND v.estado = 'pendiente'),
      'next', (SELECT jsonb_build_object('from', v.fecha_inicio, 'to', v.fecha_fin, 'days', v.dias, 'status', v.estado) FROM trabajadores_vacaciones v
        WHERE v.empleado_id = e.id AND v.fecha_fin >= v_today AND v.estado IN ('aprobado', 'pendiente', 'disfrutado') ORDER BY v.fecha_inicio LIMIT 1),
      'used_year', (SELECT coalesce(sum(v.dias), 0) FROM trabajadores_vacaciones v WHERE v.empleado_id = e.id AND v.estado IN ('aprobado', 'disfrutado') AND v.fecha_inicio >= date_trunc('year', v_today))),
    'credit', jsonb_build_object(
      'month', (SELECT round(coalesce(sum(c.total), 0), 2) FROM trabajadores_credito_facturas c WHERE c.empleado_id = e.id AND c.fecha >= v_month AND c.estado <> 'rechazada'),
      'limit', e.limite_credito_mensual)
  ) ORDER BY e.orden NULLS LAST, e.nombre) FROM empleados e WHERE e.activo), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.owner_digest_equipo(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_digest_equipo(text) TO anon;

-- Un proveedor: lo que le compras, sus facturas y cómo cambian sus precios.
CREATE OR REPLACE FUNCTION public.owner_digest_proveedor(p_key text, p_nombre text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_words text[];
BEGIN
  IF NOT public.owner_digest_key_ok(p_key) THEN
    RAISE EXCEPTION 'owner_digest_proveedor: clave no válida' USING ERRCODE = '42501';
  END IF;
  IF p_nombre IS NULL OR length(btrim(p_nombre)) < 2 OR length(p_nombre) > 160 THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(array_agg(w), '{}') INTO v_words FROM (
    SELECT w FROM regexp_split_to_table(lower(p_nombre), '[^a-záéíóúñü0-9]+') AS w
    WHERE length(w) >= 3 AND w NOT IN ('los', 'las', 'del', 'sl', 'slu', 'sa', 'cb', 'grupo')
  ) x;
  IF array_length(v_words, 1) IS NULL THEN v_words := ARRAY[lower(btrim(p_nombre))]; END IF;

  RETURN (WITH f AS (
      SELECT fa.id, fa.fecha, fa.total, fa.doc_number, fa.contact_name FROM manager_facturas fa
      WHERE fa.tipo = 'COMPRA' AND fa.fecha >= v_today - 365
        AND NOT EXISTS (SELECT 1 FROM unnest(v_words) w WHERE position(w IN lower(fa.contact_name)) = 0)
    ), l AS (
      SELECT li.nombre, li.fecha, li.units, li.subtotal FROM manager_lineas li JOIN f ON f.id = li.factura_id WHERE li.units > 0
    ), now30 AS (
      SELECT nombre, sum(subtotal) AS spent, sum(subtotal) / nullif(sum(units), 0) AS price FROM l WHERE fecha >= v_today - 30 GROUP BY nombre
    ), prev30 AS (
      SELECT nombre, sum(subtotal) / nullif(sum(units), 0) AS price FROM l WHERE fecha < v_today - 30 AND fecha >= v_today - 60 GROUP BY nombre
    )
    SELECT jsonb_build_object(
      'name', p_nombre,
      'names', (SELECT jsonb_agg(DISTINCT contact_name) FROM (SELECT contact_name FROM f LIMIT 50) n),
      'last_purchase', (SELECT max(fecha) FROM f),
      'month_total', (SELECT round(coalesce(sum(total), 0), 2) FROM f WHERE fecha >= date_trunc('month', v_today)),
      'months', (SELECT coalesce(jsonb_agg(jsonb_build_object('month', to_char(mm.m, 'YYYY-MM'), 'total', round(coalesce((SELECT sum(total) FROM f WHERE date_trunc('month', f.fecha) = mm.m), 0), 2)) ORDER BY mm.m), '[]'::jsonb)
        FROM generate_series(date_trunc('month', v_today) - interval '5 months', date_trunc('month', v_today), interval '1 month') AS mm(m)),
      'invoices', coalesce((SELECT jsonb_agg(jsonb_build_object('number', i.doc_number, 'date', i.fecha, 'total', round(i.total, 2)) ORDER BY i.fecha DESC)
        FROM (SELECT * FROM f ORDER BY fecha DESC LIMIT 10) i), '[]'::jsonb),
      'products', coalesce((SELECT jsonb_agg(jsonb_build_object('name', n.nombre, 'spent', round(n.spent, 2), 'price', round(n.price, 3), 'before', round(p.price, 3),
          'change_pct', CASE WHEN p.price > 0 THEN round((n.price / p.price - 1) * 100, 1) END) ORDER BY n.spent DESC)
        FROM (SELECT * FROM now30 ORDER BY spent DESC LIMIT 12) n LEFT JOIN prev30 p ON p.nombre = n.nombre), '[]'::jsonb)
    ));
END;
$function$;
REVOKE ALL ON FUNCTION public.owner_digest_proveedor(text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_digest_proveedor(text, text) TO anon;
