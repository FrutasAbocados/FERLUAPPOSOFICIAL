-- MT4b: el coste de compras recientes MAPEADAS (manager_coste_alias_calc) pasa a ser la
-- fuente primaria de coste, por encima de las tablas calc viejas (congeladas desde 9-may
-- porque las compras entran sin product_id). Resuelve el coste a valor ACTUAL.
-- Jerarquía: mcn -> mc -> pc2(manual) -> alias(pid) -> alias(pwph pid) -> cpc -> cpw -> cnc -> pc2(congelado)
CREATE OR REPLACE VIEW manager_lineas_efectivas AS
 SELECT l.id, l.factura_id, l.tipo, l.subtipo, l.fecha, l.contact_id, l.product_id,
    l.nombre, l.descripcion, l.sku, l.units, l.price, l.discount, l.tax_rate, l.subtotal,
    (COALESCE(l.subtotal, 0::numeric) * (1::numeric + COALESCE(l.tax_rate, 0::numeric) / 100::numeric))::numeric(14,4) AS total_linea,
    COALESCE(mcn.coste_eur, mc.coste_eur, CASE WHEN pc2.es_manual THEN pc2.coste_eur END,
             ap.coste_eur, aw.coste_eur, cpc.coste_eur, cpw.coste_eur, cnc.coste_eur,
             pc2.coste_eur)::numeric(12,4) AS coste_unidad,
    (COALESCE(l.units, 0::numeric) * COALESCE(mcn.coste_eur, mc.coste_eur, CASE WHEN pc2.es_manual THEN pc2.coste_eur END,
             ap.coste_eur, aw.coste_eur, cpc.coste_eur, cpw.coste_eur, cnc.coste_eur,
             pc2.coste_eur, 0::numeric))::numeric(14,4) AS cogs_linea,
    (COALESCE(l.subtotal, 0::numeric) - COALESCE(l.units, 0::numeric) * COALESCE(mcn.coste_eur, mc.coste_eur, CASE WHEN pc2.es_manual THEN pc2.coste_eur END,
             ap.coste_eur, aw.coste_eur, cpc.coste_eur, cpw.coste_eur, cnc.coste_eur,
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
     LEFT JOIN manager_coste_alias_calc ap ON ap.product_id = l.product_id
     LEFT JOIN manager_coste_alias_calc aw ON aw.product_id = pwph_match.holded_product_id
     LEFT JOIN manager_producto_coste pc2 ON pc2.product_id = pwph_match.holded_product_id
     LEFT JOIN manager_coste_producto_calc cpc ON cpc.product_id = l.product_id
     LEFT JOIN manager_coste_producto_calc cpw ON cpw.product_id = pwph_match.holded_product_id
     LEFT JOIN manager_coste_nombre_calc cnc ON cnc.nombre_norm = lower(TRIM(BOTH FROM l.nombre))
     LEFT JOIN manager_clientes_alias a ON a.alias_from = e.contact_name;
