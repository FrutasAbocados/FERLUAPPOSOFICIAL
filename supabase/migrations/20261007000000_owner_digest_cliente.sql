-- owner_digest_cliente (LuisOS): la ficha de un cliente en una sola lectura, con
-- la misma clave de solo lectura que owner_digest. Une Cobros (por nombre) con
-- las ventas de Holded, incidencias y preferencias (por palabras del nombre).
CREATE OR REPLACE FUNCTION public.owner_digest_cliente(p_key text, p_nombre text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ok boolean;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_words text[];
  v_cliente uuid;
BEGIN
  SELECT true INTO v_ok FROM public.integration_access_keys
   WHERE name = 'luisos' AND active AND scope = 'owner_digest'
     AND key_sha256 = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'owner_digest_cliente: clave no válida' USING ERRCODE = '42501';
  END IF;
  IF p_nombre IS NULL OR length(btrim(p_nombre)) < 2 OR length(p_nombre) > 160 THEN
    RETURN NULL;
  END IF;

  -- Palabras útiles del nombre (sin artículos ni formas jurídicas).
  SELECT coalesce(array_agg(w), '{}') INTO v_words FROM (
    SELECT w FROM regexp_split_to_table(lower(p_nombre), '[^a-záéíóúñü0-9]+') AS w
    WHERE length(w) >= 3 AND w NOT IN ('los', 'las', 'del', 'restaurante', 'bar', 'casa', 'sl', 'slu', 'sa', 'cb', 'grupo')
  ) x;
  IF array_length(v_words, 1) IS NULL THEN
    v_words := ARRAY[lower(btrim(p_nombre))];
  END IF;

  SELECT id INTO v_cliente FROM cobros_clientes WHERE lower(nombre) = lower(btrim(p_nombre)) AND activo LIMIT 1;

  RETURN jsonb_build_object(
    'name', p_nombre,
    'debt', (SELECT jsonb_build_object(
        'pending', round(coalesce(sum(coalesce(m.importe, 0) - coalesce(m.importe_cobrado, 0)), 0), 2),
        'overdue', round(coalesce(sum(CASE WHEN m.fecha_vencimiento < v_today THEN coalesce(m.importe, 0) - coalesce(m.importe_cobrado, 0) ELSE 0 END), 0), 2),
        'oldest', min(m.fecha_vencimiento),
        'invoices', coalesce((SELECT jsonb_agg(jsonb_build_object('number', i.numero_factura, 'date', i.fecha_factura, 'due', i.fecha_vencimiento, 'amount', round(coalesce(i.importe, 0) - coalesce(i.importe_cobrado, 0), 2)) ORDER BY i.fecha_vencimiento NULLS LAST)
          FROM (SELECT * FROM cobros_movimientos WHERE cliente_id = v_cliente AND pagado = false ORDER BY fecha_vencimiento NULLS LAST LIMIT 20) i), '[]'::jsonb),
        'last_paid', (SELECT max(fecha_cobro) FROM cobros_movimientos WHERE cliente_id = v_cliente AND pagado = true),
        'paid_90d', (SELECT round(coalesce(sum(importe_cobrado), 0), 2) FROM cobros_movimientos WHERE cliente_id = v_cliente AND pagado = true AND fecha_cobro >= v_today - 90))
      FROM cobros_movimientos m WHERE m.cliente_id = v_cliente AND m.pagado = false),
    'sales', (WITH f AS (
        SELECT fa.fecha, fa.total, fa.contact_name FROM manager_facturas fa
        WHERE fa.tipo = 'VENTA' AND fa.fecha >= v_today - 365
          AND NOT EXISTS (SELECT 1 FROM unnest(v_words) w WHERE position(w IN lower(fa.contact_name)) = 0)
      )
      SELECT jsonb_build_object(
        'names', (SELECT jsonb_agg(DISTINCT contact_name) FROM (SELECT contact_name FROM f LIMIT 50) n),
        'last_order', max(f.fecha),
        'orders_90d', count(*) FILTER (WHERE f.fecha >= v_today - 90),
        'avg_ticket', round(avg(f.total) FILTER (WHERE f.fecha >= v_today - 90), 2),
        'months', (SELECT coalesce(jsonb_agg(jsonb_build_object('month', to_char(mm.m, 'YYYY-MM'), 'total', round(coalesce((SELECT sum(total) FROM f WHERE date_trunc('month', f.fecha) = mm.m), 0), 2)) ORDER BY mm.m), '[]'::jsonb)
          FROM generate_series(date_trunc('month', v_today) - interval '5 months', date_trunc('month', v_today), interval '1 month') AS mm(m)))
      FROM f),
    'incidents', coalesce((SELECT jsonb_agg(jsonb_build_object('date', i.fecha, 'kind', i.tipo, 'status', i.estado, 'text', left(i.descripcion, 200)) ORDER BY i.fecha DESC)
      FROM (SELECT * FROM incidencias inc WHERE NOT EXISTS (SELECT 1 FROM unnest(v_words) w WHERE position(w IN lower(inc.contact_name_canon)) = 0) ORDER BY fecha DESC LIMIT 6) i), '[]'::jsonb),
    'prefs', (SELECT jsonb_build_object('phone', p.telefono, 'hour', p.hora_preferida, 'day', p.dia_preferido, 'notes', left(p.notas, 200), 'paused_until', p.en_pausa_hasta)
      FROM clientes_preferencias p WHERE NOT EXISTS (SELECT 1 FROM unnest(v_words) w WHERE position(w IN lower(p.contact_name_canon)) = 0) LIMIT 1)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_digest_cliente(text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_digest_cliente(text, text) TO anon;
