-- COGS real desde líneas de compra Holded
-- Añade LATERAL join a manager_lineas_efectivas para usar el precio de la
-- última compra real del producto (antes de la fecha de venta) en lugar del
-- coste manual. Fallback: manager_producto_coste (manual), luego nombre fuzzy.

-- Índice para lookup eficiente: última compra por producto
CREATE INDEX IF NOT EXISTS idx_manager_lineas_compra_product_fecha
  ON manager_lineas (product_id, fecha DESC)
  WHERE tipo = 'COMPRA' AND product_id IS NOT NULL AND units > 0 AND subtotal > 0;

-- Recrear vista con coste real de compra como primera fuente
CREATE OR REPLACE VIEW manager_lineas_efectivas AS
SELECT l.id,
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
    COALESCE(uc.coste_compra, pc.coste_eur, pc2.coste_eur) AS coste_unidad,
    (COALESCE(l.units, 0::numeric) * COALESCE(uc.coste_compra, pc.coste_eur, pc2.coste_eur, 0::numeric))::numeric(14,4) AS cogs_linea,
    (COALESCE(l.subtotal, 0::numeric) - COALESCE(l.units, 0::numeric) * COALESCE(uc.coste_compra, pc.coste_eur, pc2.coste_eur, 0::numeric))::numeric(14,4) AS margen_linea,
    COALESCE(a.alias_to, e.contact_name) AS contact_name_canon,
    e.contact_name AS contact_name_raw
   FROM manager_lineas l
     JOIN manager_ventas_efectivas e ON e.id = l.factura_id
     LEFT JOIN manager_producto_coste pc ON pc.product_id = l.product_id
     LEFT JOIN LATERAL (
           SELECT pwph.holded_product_id
           FROM pedidos_wa_productos_holded pwph
          WHERE l.product_id IS NULL AND pwph.holded_product_id <> '0'::text
            AND (lower(trim(l.nombre)) = lower(pwph.holded_product_name)
              OR lower(trim(l.nombre)) = pwph.producto_normalizado)
         LIMIT 1) pwph_match ON true
     LEFT JOIN manager_producto_coste pc2 ON pc2.product_id = pwph_match.holded_product_id
     -- Última compra real del producto en o antes de la fecha de venta
     LEFT JOIN LATERAL (
           SELECT (ml.subtotal / NULLIF(ml.units, 0::numeric))::numeric(14,4) AS coste_compra
           FROM manager_lineas ml
           WHERE ml.tipo = 'COMPRA'
             AND ml.product_id = l.product_id
             AND ml.product_id IS NOT NULL
             AND ml.units > 0
             AND ml.subtotal > 0
             AND (ml.fecha IS NULL OR ml.fecha <= COALESCE(l.fecha, CURRENT_DATE))
           ORDER BY ml.fecha DESC NULLS LAST
           LIMIT 1) uc ON l.product_id IS NOT NULL
     LEFT JOIN manager_clientes_alias a ON a.alias_from = e.contact_name;
