-- FIX A: las ventas que resuelven coste por la vía pwph (product_id NULL en la línea,
-- mapeado a holded_product_id) tiraban de manager_producto_coste, que está CONGELADA
-- desde 2026-05-09 (ningún cron la refresca; quedó obsoleta tras las tablas *_calc).
-- Reconectamos esa vía al coste VIVO (manager_coste_producto_calc por el id mapeado),
-- preservando los costes MANUALES (es_manual) como override intencional y dejando el
-- valor congelado solo como ÚLTIMO recurso (mejor que nada).
CREATE OR REPLACE VIEW manager_lineas_efectivas AS
 SELECT l.id, l.factura_id, l.tipo, l.subtipo, l.fecha, l.contact_id, l.product_id,
    l.nombre, l.descripcion, l.sku, l.units, l.price, l.discount, l.tax_rate, l.subtotal,
    (COALESCE(l.subtotal, 0::numeric) * (1::numeric + COALESCE(l.tax_rate, 0::numeric) / 100::numeric))::numeric(14,4) AS total_linea,
    COALESCE(mcn.coste_eur, mc.coste_eur,
             CASE WHEN pc2.es_manual THEN pc2.coste_eur END,
             cpc.coste_eur, cpw.coste_eur, cnc.coste_eur,
             pc2.coste_eur)::numeric(12,4) AS coste_unidad,
    (COALESCE(l.units, 0::numeric) * COALESCE(mcn.coste_eur, mc.coste_eur, CASE WHEN pc2.es_manual THEN pc2.coste_eur END,
             cpc.coste_eur, cpw.coste_eur, cnc.coste_eur,
             pc2.coste_eur, 0::numeric))::numeric(14,4) AS cogs_linea,
    (COALESCE(l.subtotal, 0::numeric) - COALESCE(l.units, 0::numeric) * COALESCE(mcn.coste_eur, mc.coste_eur, CASE WHEN pc2.es_manual THEN pc2.coste_eur END,
             cpc.coste_eur, cpw.coste_eur, cnc.coste_eur,
             pc2.coste_eur, 0::numeric))::numeric(14,4) AS margen_linea,
    COALESCE(a.alias_to, e.contact_name) AS contact_name_canon,
    e.contact_name AS contact_name_raw
   FROM manager_lineas l
     JOIN manager_ventas_efectivas e ON e.id = l.factura_id
     LEFT JOIN manager_costes_manuales_nombre mcn ON mcn.nombre_norm = lower(TRIM(BOTH FROM l.nombre))
     LEFT JOIN LATERAL ( SELECT manager_costes_manuales.coste_eur
           FROM manager_costes_manuales
          WHERE manager_costes_manuales.product_id = l.product_id AND manager_costes_manuales.fecha_desde <= COALESCE(l.fecha, CURRENT_DATE)
          ORDER BY manager_costes_manuales.fecha_desde DESC LIMIT 1) mc ON true
     LEFT JOIN LATERAL ( SELECT pwph.holded_product_id
           FROM pedidos_wa_productos_holded pwph
          WHERE l.product_id IS NULL AND pwph.holded_product_id <> '0'::text AND (lower(TRIM(BOTH FROM l.nombre)) = lower(pwph.holded_product_name) OR lower(TRIM(BOTH FROM l.nombre)) = pwph.producto_normalizado)
         LIMIT 1) pwph_match ON true
     LEFT JOIN manager_producto_coste pc2 ON pc2.product_id = pwph_match.holded_product_id
     LEFT JOIN manager_coste_producto_calc cpc ON cpc.product_id = l.product_id
     LEFT JOIN manager_coste_producto_calc cpw ON cpw.product_id = pwph_match.holded_product_id
     LEFT JOIN manager_coste_nombre_calc cnc ON cnc.nombre_norm = lower(TRIM(BOTH FROM l.nombre))
     LEFT JOIN manager_clientes_alias a ON a.alias_from = e.contact_name;
