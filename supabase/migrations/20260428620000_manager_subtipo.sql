-- ============================================================================
-- Manager Holded — añadir subtipo + ampliar a waybill/salesreceipt/creditnote
-- ============================================================================
-- `tipo` (VENTA|COMPRA) seguía bien pero perdíamos qué tipo de doc era. Ahora
-- guardamos el docType de Holded en `subtipo`:
--   VENTA  → invoice | salesreceipt | waybill | creditnote
--   COMPRA → purchase | purchaserefund
-- Necesario para la regla "no contar dos veces": clientes con waybill en el mes
-- → contar waybill, ignorar invoice (porque la invoice es la agregada mensual).
-- ============================================================================

alter table public.manager_facturas
  add column if not exists subtipo text;

alter table public.manager_lineas
  add column if not exists subtipo text;

create index if not exists manager_facturas_subtipo_idx on public.manager_facturas (tipo, subtipo, fecha desc);
create index if not exists manager_lineas_subtipo_idx   on public.manager_lineas   (tipo, subtipo, fecha desc);
