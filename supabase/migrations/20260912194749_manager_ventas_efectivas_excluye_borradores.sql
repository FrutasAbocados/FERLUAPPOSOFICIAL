-- Los borradores de venta de Holded (sin docNumber) contaban como venta real.
-- El 12-09-2026 un borrador de ALMA FUENGIROLA de 214,11 € infló el día y rompió
-- el cuadre del cierre contra la ruta.
--
-- No se puede usar `status = 0`: lo tienen 1.421 de 1.445 facturas (significa
-- pendiente de cobro, no borrador). El marcador fiable es la ausencia de número.
-- Se excluye solo en los subtipos que vienen de Holded: los documentos internos
-- de El Abuelo los crea la propia app y 14 de 50 no llevan número legítimamente.

create or replace view public.manager_ventas_efectivas as
 WITH meses_con_albaran AS (
         SELECT manager_facturas.contact_id,
            date_trunc('month'::text, manager_facturas.fecha::timestamp with time zone)::date AS mes
           FROM manager_facturas
          WHERE manager_facturas.tipo = 'VENTA'::text AND manager_facturas.subtipo = 'waybill'::text AND manager_facturas.contact_id IS NOT NULL
          GROUP BY manager_facturas.contact_id, (date_trunc('month'::text, manager_facturas.fecha::timestamp with time zone)::date)
        )
 SELECT id, tipo, doc_number, contact_id, contact_name, fecha, fecha_vencimiento,
    descripcion, subtotal, impuestos, descuento, total, status, payments_total,
    payments_pending, payments_refunds, currency, tags, raw, updated_at, subtipo
   FROM manager_facturas f
  WHERE tipo = 'VENTA'::text
    AND NOT (COALESCE(doc_number, ''::text) = ''::text AND subtipo <> 'abuelo'::text)
    AND NOT (subtipo = 'invoice'::text AND (contact_id IS NOT NULL AND (EXISTS ( SELECT 1
           FROM meses_con_albaran m
          WHERE m.contact_id = f.contact_id AND m.mes = date_trunc('month'::text, f.fecha::timestamp with time zone)::date)) OR COALESCE(((raw -> 'from'::text) ->> 'docType'::text) = 'waybill'::text, false)));
