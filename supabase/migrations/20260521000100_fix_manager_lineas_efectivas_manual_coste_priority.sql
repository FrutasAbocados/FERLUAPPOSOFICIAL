-- Fix: manager_lineas_efectivas usaba COALESCE(uc.coste_compra, pc.coste_eur, ...)
-- con lo que la última compra real siempre ganaba al coste manual.
-- Ahora pc.coste_eur (que ya devuelve COALESCE(manual, avg4compras) en manager_producto_coste)
-- tiene prioridad. Cuando hay manual → usa el manual. Sin manual → avg4 compras igual que antes.
CREATE OR REPLACE VIEW public.manager_lineas_efectivas AS
SELECT
  l.id,
  l.factura_id,
  l.tipo,
  l.subtipo,
  l.fecha,
  l.contact_id,
  l.product_id,
  l.nombre,
  l.descripcion,
  l.sku,
  l.units,
  l.price,
  l.discount,
  l.tax_rate,
  l.subtotal,
  (COALESCE(l.subtotal, 0::numeric) * (1::numeric + COALESCE(l.tax_rate, 0::numeric) / 100::numeric))::numeric(14,4) AS total_linea,
  -- Manual override (via manager_producto_coste) ahora GANA sobre última compra real
  COALESCE(pc.coste_eur, pc2.coste_eur, uc.coste_compra) AS coste_unidad,
  (COALESCE(l.units, 0::numeric) * COALESCE(pc.coste_eur, pc2.coste_eur, uc.coste_compra, 0::numeric))::numeric(14,4) AS cogs_linea,
  (COALESCE(l.subtotal, 0::numeric) - COALESCE(l.units, 0::numeric) * COALESCE(pc.coste_eur, pc2.coste_eur, uc.coste_compra, 0::numeric))::numeric(14,4) AS margen_linea,
  COALESCE(a.alias_to, e.contact_name) AS contact_name_canon,
  e.contact_name AS contact_name_raw
FROM manager_lineas l
JOIN manager_ventas_efectivas e ON e.id = l.factura_id
LEFT JOIN manager_producto_coste pc ON pc.product_id = l.product_id
LEFT JOIN LATERAL (
  SELECT pwph.holded_product_id
  FROM pedidos_wa_productos_holded pwph
  WHERE l.product_id IS NULL
    AND pwph.holded_product_id <> '0'::text
    AND (lower(TRIM(BOTH FROM l.nombre)) = lower(pwph.holded_product_name)
      OR lower(TRIM(BOTH FROM l.nombre)) = pwph.producto_normalizado)
  LIMIT 1
) pwph_match ON true
LEFT JOIN manager_producto_coste pc2 ON pc2.product_id = pwph_match.holded_product_id
LEFT JOIN LATERAL (
  SELECT (ml.subtotal / NULLIF(ml.units, 0::numeric))::numeric(12,4) AS coste_compra
  FROM manager_lineas ml
  WHERE ml.tipo = 'COMPRA'::text
    AND ml.product_id = l.product_id
    AND ml.product_id IS NOT NULL
    AND ml.units > 0::numeric
    AND ml.subtotal > 0::numeric
    AND (ml.fecha IS NULL OR ml.fecha <= COALESCE(l.fecha, CURRENT_DATE))
  ORDER BY ml.fecha DESC NULLS LAST
  LIMIT 1
) uc ON l.product_id IS NOT NULL
LEFT JOIN manager_clientes_alias a ON a.alias_from = e.contact_name;

ALTER VIEW public.manager_lineas_efectivas OWNER TO postgres;
