-- Luis 2026-11-24:
-- 1) Las ventas a FRUTAS PEREZ ALCALDE S.L. (proveedor; reventa a coste) no cuentan
--    en AbocadosOS: se excluyen de manager_ventas_efectivas y, por tanto, de Manager,
--    dashboards e informes de margen. Holded y Cobros no se tocan.
-- 2) Coste real de HUEVOS L DOCENA = 1,99 EUR/docena.

CREATE TABLE IF NOT EXISTS public.manager_clientes_excluidos (
  contact_id   text PRIMARY KEY,
  contact_name text NOT NULL,
  motivo       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manager_clientes_excluidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manager_clientes_excluidos FROM anon, authenticated;
GRANT SELECT ON public.manager_clientes_excluidos TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.manager_clientes_excluidos TO authenticated;

-- Lectura para todo usuario autenticado: las vistas son security_invoker y el filtro
-- debe aplicarse igual para cualquier rol que consulte ventas.
DROP POLICY IF EXISTS "manager_clientes_excluidos: authenticated read" ON public.manager_clientes_excluidos;
CREATE POLICY "manager_clientes_excluidos: authenticated read" ON public.manager_clientes_excluidos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "manager_clientes_excluidos: admin rw" ON public.manager_clientes_excluidos;
CREATE POLICY "manager_clientes_excluidos: admin rw" ON public.manager_clientes_excluidos
  FOR ALL TO authenticated
  USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

INSERT INTO public.manager_clientes_excluidos (contact_id, contact_name, motivo)
VALUES ('6923e68c528c6c69df09b578', 'FRUTAS PEREZ ALCALDE S.L.',
        'Luis 24-nov: proveedor; sus ventas (reventa a coste) no entran en AbocadosOS')
ON CONFLICT (contact_id) DO NOTHING;

-- Sin estadísticas el planificador estima 1 fila en la vista y el informe de margen da timeout.
ANALYZE public.manager_clientes_excluidos;

CREATE OR REPLACE VIEW public.manager_ventas_efectivas
WITH (security_invoker = true) AS
 WITH meses_con_albaran AS (
         SELECT manager_facturas.contact_id,
            (date_trunc('month'::text, (manager_facturas.fecha)::timestamp with time zone))::date AS mes
           FROM manager_facturas
          WHERE ((manager_facturas.tipo = 'VENTA'::text) AND (manager_facturas.subtipo = 'waybill'::text) AND (manager_facturas.contact_id IS NOT NULL) AND (COALESCE((manager_facturas.raw ->> 'draft'::text), 'false'::text) <> 'true'::text))
          GROUP BY manager_facturas.contact_id, ((date_trunc('month'::text, (manager_facturas.fecha)::timestamp with time zone))::date)
        )
 SELECT id,
    tipo,
    doc_number,
    contact_id,
    contact_name,
    fecha,
    fecha_vencimiento,
    descripcion,
    subtotal,
    impuestos,
    descuento,
    total,
    status,
    payments_total,
    payments_pending,
    payments_refunds,
    currency,
    tags,
    raw,
    updated_at,
    subtipo
   FROM manager_facturas f
  WHERE ((tipo = 'VENTA'::text) AND (COALESCE((raw ->> 'draft'::text), 'false'::text) <> 'true'::text) AND (NOT ((COALESCE(doc_number, ''::text) = ''::text) AND (subtipo <> 'abuelo'::text))) AND (NOT ((subtipo = 'invoice'::text) AND (((contact_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM meses_con_albaran m
          WHERE ((m.contact_id = f.contact_id) AND (m.mes = (date_trunc('month'::text, (f.fecha)::timestamp with time zone))::date))))) OR COALESCE((((raw -> 'from'::text) ->> 'docType'::text) = 'waybill'::text), false))))
    AND (NOT EXISTS ( SELECT 1 FROM public.manager_clientes_excluidos x WHERE x.contact_id = f.contact_id)));

INSERT INTO public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota, fecha_hasta, updated_at)
VALUES ('huevos l docena', 1.99, 'Luis 24-nov: 1,99 EUR/docena', NULL, now()),
       ('docena huevos l', 1.99, 'Luis 24-nov: 1,99 EUR/docena', NULL, now())
ON CONFLICT (nombre_norm) DO UPDATE
  SET coste_eur = EXCLUDED.coste_eur, nota = EXCLUDED.nota, fecha_hasta = NULL, updated_at = now();
