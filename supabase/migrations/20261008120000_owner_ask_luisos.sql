-- Preguntas libres de LuisOS sobre Abocados, por voz o por escrito.
--
-- No hay SQL libre: la IA de LuisOS elige una consulta de este catálogo y le pasa
-- parámetros (fechas, cliente, producto, proveedor). Solo lectura, misma clave de
-- integración que owner_digest, rango máximo de 400 días y resultados acotados.

CREATE OR REPLACE FUNCTION public.owner_ask(p_key text, p_query text, p_args jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_from date;
  v_to date;
  v_name text;
  v_limit int;
  v_period boolean;
  v_match text;
BEGIN
  p_args := coalesce(p_args, '{}'::jsonb);
  v_name := nullif(btrim(coalesce(p_args->>'name', '')), '');
  v_period := p_args ? 'from' OR p_args ? 'to';
  IF NOT public.owner_digest_key_ok(p_key) THEN
    RAISE EXCEPTION 'owner_ask: clave no válida' USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_from := coalesce((p_args->>'from')::date, date_trunc('month', v_today)::date);
    v_to := coalesce((p_args->>'to')::date, v_today);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('error', 'Fechas no válidas (YYYY-MM-DD)');
  END;
  v_limit := least(greatest(coalesce((p_args->>'limit')::int, 15), 1), 40);
  IF v_to < v_from THEN
    RETURN jsonb_build_object('error', 'La fecha final es anterior a la inicial');
  END IF;
  IF v_to - v_from > 400 THEN
    v_from := v_to - 400;
  END IF;
  IF v_name IS NOT NULL AND length(v_name) > 160 THEN
    RETURN jsonb_build_object('error', 'Nombre demasiado largo');
  END IF;

  CASE p_query

  -- Deuda de clientes (módulo Cobros, la verdad de la deuda). Con from/to: solo
  -- facturas fechadas en ese periodo; con name: solo ese cliente.
  WHEN 'deuda' THEN
    RETURN (
      WITH m AS (
        SELECT c.nombre, mv.fecha_factura, mv.fecha_vencimiento,
               coalesce(mv.importe, 0) - coalesce(mv.importe_cobrado, 0) AS pend
        FROM cobros_movimientos mv JOIN cobros_clientes c ON c.id = mv.cliente_id AND c.activo
        WHERE NOT mv.pagado
          AND (NOT v_period OR mv.fecha_factura BETWEEN v_from AND v_to)
          AND (v_name IS NULL OR c.nombre ILIKE '%' || v_name || '%')
      )
      SELECT jsonb_build_object(
        'period', CASE WHEN v_period THEN jsonb_build_object('invoice_from', v_from, 'invoice_to', v_to) ELSE '"toda la deuda abierta"'::jsonb END,
        'pending', round(coalesce(sum(pend), 0), 2),
        'overdue', round(coalesce(sum(pend) FILTER (WHERE fecha_vencimiento < v_today), 0), 2),
        'not_due_yet', round(coalesce(sum(pend) FILTER (WHERE fecha_vencimiento IS NULL OR fecha_vencimiento >= v_today), 0), 2),
        'invoices', count(*),
        'by_invoice_month', (SELECT coalesce(jsonb_agg(jsonb_build_object('month', mo, 'pending', p, 'overdue', o) ORDER BY mo), '[]'::jsonb) FROM (
            SELECT to_char(fecha_factura, 'YYYY-MM') mo, round(sum(pend), 2) p, round(sum(pend) FILTER (WHERE fecha_vencimiento < v_today), 2) o
            FROM m GROUP BY 1) x),
        'clients', (SELECT coalesce(jsonb_agg(jsonb_build_object('client', nombre, 'pending', p, 'overdue', o, 'oldest_due', od) ORDER BY p DESC), '[]'::jsonb) FROM (
            SELECT nombre, round(sum(pend), 2) p, round(coalesce(sum(pend) FILTER (WHERE fecha_vencimiento < v_today), 0), 2) o, min(fecha_vencimiento) od
            FROM m GROUP BY nombre HAVING sum(pend) > 0.5 ORDER BY sum(pend) DESC LIMIT v_limit) y)
      ) FROM m);

  -- Lo cobrado (fecha de cobro en el periodo).
  WHEN 'cobrado' THEN
    RETURN (
      WITH m AS (
        SELECT c.nombre, mv.metodo_cobro::text AS metodo, coalesce(mv.importe_cobrado, mv.importe, 0) AS imp
        FROM cobros_movimientos mv JOIN cobros_clientes c ON c.id = mv.cliente_id
        WHERE mv.pagado AND mv.fecha_cobro BETWEEN v_from AND v_to
          AND (v_name IS NULL OR c.nombre ILIKE '%' || v_name || '%')
      )
      SELECT jsonb_build_object('from', v_from, 'to', v_to, 'total', round(coalesce(sum(imp), 0), 2), 'payments', count(*),
        'by_method', (SELECT coalesce(jsonb_object_agg(coalesce(metodo, 'sin método'), t), '{}'::jsonb) FROM (SELECT metodo, round(sum(imp), 2) t FROM m GROUP BY 1) a),
        'clients', (SELECT coalesce(jsonb_agg(jsonb_build_object('client', nombre, 'total', t) ORDER BY t DESC), '[]'::jsonb) FROM (
            SELECT nombre, round(sum(imp), 2) t FROM m GROUP BY 1 ORDER BY 2 DESC LIMIT v_limit) b))
      FROM m);

  -- Ventas, compras y margen del periodo frente al periodo anterior equivalente.
  WHEN 'resumen' THEN
    RETURN (SELECT to_jsonb(r) || jsonb_build_object('from', v_from, 'to', v_to)
      FROM owner_digest_resumen(v_from, v_to) r LIMIT 1);

  -- Ventas, compras y margen día a día (máximo 92 días).
  WHEN 'serie_diaria' THEN
    RETURN (SELECT jsonb_build_object('from', greatest(v_from, v_to - 92), 'to', v_to, 'days', coalesce(jsonb_agg(jsonb_build_object('date', fecha, 'sales', round(ventas, 2), 'purchases', round(compras, 2), 'margin', round(margen, 2)) ORDER BY fecha), '[]'::jsonb))
      FROM manager_serie_diaria(greatest(v_from, v_to - 92), v_to));

  -- Ventas por mes (los últimos meses hasta `to`).
  WHEN 'meses' THEN
    RETURN (SELECT jsonb_build_object('months', coalesce(jsonb_agg(jsonb_build_object('month', to_char(mm, 'YYYY-MM'), 'sales', round(v, 2), 'purchases', round(c, 2), 'invoices', n) ORDER BY mm), '[]'::jsonb)) FROM (
      SELECT date_trunc('month', f.fecha) mm,
             sum(f.subtotal) FILTER (WHERE f.tipo = 'VENTA') v,
             sum(f.subtotal) FILTER (WHERE f.tipo = 'COMPRA') c,
             count(*) FILTER (WHERE f.tipo = 'VENTA') n
      FROM manager_facturas f
      WHERE f.fecha BETWEEN date_trunc('month', v_from)::date AND v_to
      GROUP BY 1) x);

  -- Mejores clientes del periodo por ventas y margen.
  WHEN 'clientes_top' THEN
    RETURN (SELECT jsonb_build_object('from', v_from, 'to', v_to, 'clients', coalesce(jsonb_agg(jsonb_build_object('client', contact_name_canon, 'orders', docs, 'sales', round(ventas_subtotal, 2), 'margin', round(margen, 2), 'margin_pct', margen_pct)), '[]'::jsonb))
      FROM manager_top_clientes_margen(v_from, v_to, v_limit));

  -- Ficha de un cliente: deuda, facturas pendientes, pedidos, meses, incidencias.
  WHEN 'cliente' THEN
    IF v_name IS NULL THEN RETURN jsonb_build_object('error', 'Falta el nombre del cliente'); END IF;
    -- El nombre tal como está en Cobros (exacto o el único que lo contiene).
    SELECT nombre INTO v_match FROM cobros_clientes WHERE activo AND lower(nombre) = lower(v_name) LIMIT 1;
    IF v_match IS NULL AND (SELECT count(*) FROM cobros_clientes WHERE activo AND nombre ILIKE '%' || v_name || '%') = 1 THEN
      SELECT nombre INTO v_match FROM cobros_clientes WHERE activo AND nombre ILIKE '%' || v_name || '%';
    END IF;
    RETURN owner_digest_cliente(p_key, coalesce(v_match, v_name))
      || jsonb_build_object('known_names', (SELECT coalesce(jsonb_agg(nombre), '[]'::jsonb) FROM (SELECT nombre FROM cobros_clientes WHERE activo AND nombre ILIKE '%' || v_name || '%' LIMIT 8) k));

  -- Mejores productos del periodo.
  WHEN 'productos_top' THEN
    RETURN (SELECT jsonb_build_object('from', v_from, 'to', v_to, 'products', coalesce(jsonb_agg(jsonb_build_object('product', nombre, 'units', round(unidades, 2), 'sales', round(ventas_subtotal, 2), 'margin', round(margen, 2), 'margin_pct', margen_pct)), '[]'::jsonb))
      FROM manager_top_productos_margen(v_from, v_to, v_limit));

  -- Un producto (búsqueda por parecido): ventas, margen y coste de cada producto
  -- que coincide en el periodo (sin fechas, los últimos 30 días) y las últimas
  -- compras del que más se vende.
  WHEN 'producto' THEN
    IF v_name IS NULL THEN RETURN jsonb_build_object('error', 'Falta el nombre del producto'); END IF;
    IF NOT v_period THEN v_from := v_to - 30; END IF;
    RETURN (
      WITH p AS (
        SELECT * FROM manager_productos_lista(v_from, v_to) l WHERE l.nombre ILIKE '%' || v_name || '%' ORDER BY l.ventas_subtotal DESC NULLS LAST LIMIT 8
      )
      SELECT jsonb_build_object('from', v_from, 'to', v_to,
        'products', coalesce((SELECT jsonb_agg(jsonb_build_object('product', nombre, 'units', round(unidades, 2), 'sales', round(ventas_subtotal, 2), 'margin', round(margen, 2), 'margin_pct', margen_pct, 'unit_cost', round(coste_unidad, 4), 'last_purchase', ultima_compra, 'last_sale', ultima_venta)) FROM p), '[]'::jsonb),
        -- Coste real de compra = subtotal / unidades de la línea COMPRA.
        'purchases', coalesce((SELECT jsonb_agg(jsonb_build_object('date', c.fecha, 'supplier', c.contact_name, 'product', c.nombre, 'units', c.units, 'unit_cost', c.coste) ORDER BY c.fecha DESC) FROM (
            SELECT l.fecha, f.contact_name, l.nombre, l.units, round(l.subtotal / nullif(l.units, 0), 4) AS coste
            FROM manager_lineas l JOIN manager_facturas f ON f.id = l.factura_id
            WHERE l.tipo = 'COMPRA' AND l.fecha >= v_to - 120 AND l.nombre ILIKE '%' || v_name || '%'
            ORDER BY l.fecha DESC LIMIT 8) c), '[]'::jsonb)));

  -- Compras por proveedor en el periodo.
  WHEN 'compras' THEN
    RETURN (
      WITH f AS (
        SELECT contact_name, subtotal, total FROM manager_facturas
        WHERE tipo = 'COMPRA' AND fecha BETWEEN v_from AND v_to
          AND (v_name IS NULL OR contact_name ILIKE '%' || v_name || '%')
      )
      SELECT jsonb_build_object('from', v_from, 'to', v_to, 'subtotal', round(coalesce(sum(subtotal), 0), 2), 'total', round(coalesce(sum(total), 0), 2), 'invoices', count(*),
        'suppliers', (SELECT coalesce(jsonb_agg(jsonb_build_object('supplier', contact_name, 'subtotal', s, 'invoices', n) ORDER BY s DESC), '[]'::jsonb) FROM (
            SELECT contact_name, round(sum(subtotal), 2) s, count(*) n FROM f GROUP BY 1 ORDER BY 2 DESC LIMIT v_limit) x))
      FROM f);

  -- Ficha de un proveedor.
  WHEN 'proveedor' THEN
    IF v_name IS NULL THEN RETURN jsonb_build_object('error', 'Falta el nombre del proveedor'); END IF;
    RETURN owner_digest_proveedor(p_key, v_name);

  -- Caja en efectivo (Tesorería): saldo y movimientos del periodo.
  WHEN 'caja' THEN
    RETURN (SELECT jsonb_build_object('from', v_from, 'to', v_to, 'balance', round(k.saldo_total, 2), 'in', round(k.entradas_periodo, 2), 'out', round(k.salidas_periodo, 2),
        'moves', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', fecha, 'type', tipo, 'concept', left(concepto, 80), 'amount', round(importe, 2)) ORDER BY fecha DESC), '[]'::jsonb) FROM (
            SELECT fecha, tipo, concepto, importe FROM tesoreria_movimientos WHERE fecha BETWEEN v_from AND v_to ORDER BY fecha DESC, created_at DESC LIMIT v_limit) t))
      FROM tesoreria_kpis(v_from, v_to) k);

  -- Facturas o albaranes (de venta o compra) con filtro por nombre.
  WHEN 'facturas' THEN
    RETURN (SELECT jsonb_build_object('from', v_from, 'to', v_to, 'documents', coalesce(jsonb_agg(jsonb_build_object('number', doc_number, 'type', tipo, 'kind', subtipo, 'contact', contact_name_canon, 'date', fecha, 'due', fecha_vencimiento, 'total', round(total, 2), 'margin_pct', margen_pct, 'pending', round(payments_pending, 2))), '[]'::jsonb), 'count', max(total_count))
      FROM manager_facturas_lista(v_from, v_to, nullif(upper(coalesce(p_args->>'type', '')), ''), NULL, v_name, v_limit, 0));

  -- Equipo: personas, vacaciones que quedan, fichajes y horas.
  WHEN 'equipo' THEN
    RETURN owner_digest_equipo(p_key);

  -- Gastos fijos activos.
  WHEN 'gastos_fijos' THEN
    RETURN (SELECT jsonb_build_object('monthly_estimate', round(coalesce(sum(CASE periodicidad WHEN 'anual' THEN importe / 12 WHEN 'trimestral' THEN importe / 3 ELSE importe END), 0), 2),
        'items', coalesce(jsonb_agg(jsonb_build_object('name', nombre, 'amount', importe, 'vat_pct', iva_pct, 'period', periodicidad, 'day', dia_cargo) ORDER BY importe DESC), '[]'::jsonb))
      FROM gastos_fijos WHERE activo);

  -- Previsión de ventas del mes en curso y el siguiente.
  WHEN 'prevision' THEN
    RETURN (SELECT to_jsonb(f) FROM manager_forecast_proximo_mes() f LIMIT 1);

  ELSE
    RETURN jsonb_build_object('error', 'Consulta desconocida');
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_ask(text, text, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_ask(text, text, jsonb) TO anon;
