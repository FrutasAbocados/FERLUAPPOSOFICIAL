-- RPC: resuelve precio de cada línea de un pedido WA buscando el último precio
-- histórico cliente×producto en manager_lineas (sólo VENTAS).
--
-- Match exact case-insensitive sobre nombre. Si no hay match para ese cliente,
-- devuelve precio_fuente='no_resuelto' y precio_resuelto=NULL — el frontend
-- pedirá al admin editar la línea antes de subir a Holded.
--
-- IVA: usa el tax_rate del histórico si existe, fallback a 4% (frutas/verduras).
-- Líneas con es_gratis=true se devuelven igual con precio 0 (Holded las puede
-- crear igualmente como cortesía si Luis quiere reflejar regalos).

DROP FUNCTION IF EXISTS public.pedidos_wa_resolver_precios(uuid);

CREATE FUNCTION public.pedidos_wa_resolver_precios(p_pedido_id uuid)
RETURNS TABLE (
  linea_id             uuid,
  orden                integer,
  producto_normalizado text,
  cantidad             numeric,
  unidad               text,
  es_gratis            boolean,
  iva_pct              numeric,
  precio_resuelto      numeric,
  precio_fuente        text,
  precio_fecha         date,
  total_estimado       numeric
)
LANGUAGE sql
SECURITY invoker
STABLE
AS $$
  WITH cliente AS (
    SELECT c.holded_contact_id
    FROM public.pedidos_wa p
    JOIN public.pedidos_wa_clientes c ON c.id = p.cliente_id
    WHERE p.id = p_pedido_id
  ),
  lineas AS (
    SELECT
      l.id, l.orden, l.cantidad, l.unidad, l.es_gratis,
      l.producto_normalizado,
      lower(l.producto_normalizado) AS prod_lower
    FROM public.pedidos_wa_lineas l
    WHERE l.pedido_id = p_pedido_id
  ),
  historico AS (
    SELECT DISTINCT ON (lower(ml.nombre))
      lower(ml.nombre) AS prod_key,
      ml.price,
      ml.tax_rate,
      ml.fecha
    FROM public.manager_lineas ml, cliente
    WHERE ml.contact_id = cliente.holded_contact_id
      AND ml.tipo       = 'VENTA'
      AND ml.price IS NOT NULL
      AND ml.price > 0
      AND lower(ml.nombre) IN (SELECT prod_lower FROM lineas)
    ORDER BY lower(ml.nombre), ml.fecha DESC
  )
  SELECT
    l.id                                                        AS linea_id,
    l.orden,
    l.producto_normalizado,
    l.cantidad,
    l.unidad,
    l.es_gratis,
    coalesce(h.tax_rate, 4)::numeric                            AS iva_pct,
    CASE WHEN l.es_gratis THEN 0 ELSE h.price END               AS precio_resuelto,
    CASE
      WHEN l.es_gratis        THEN 'gratis'
      WHEN h.price IS NOT NULL THEN 'historico_cliente'
      ELSE 'no_resuelto'
    END                                                         AS precio_fuente,
    h.fecha                                                     AS precio_fecha,
    coalesce(l.cantidad * (CASE WHEN l.es_gratis THEN 0 ELSE h.price END), 0)::numeric
                                                                AS total_estimado
  FROM lineas l
  LEFT JOIN historico h ON h.prod_key = l.prod_lower
  ORDER BY l.orden;
$$;

GRANT EXECUTE ON FUNCTION public.pedidos_wa_resolver_precios(uuid) TO authenticated;
