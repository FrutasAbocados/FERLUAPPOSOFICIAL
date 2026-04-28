-- ============================================================================
-- Manager — fix PK manager_lineas
-- ============================================================================
-- La PK original era sólo `id` (line_id de Holded). Esto rompe porque el mismo
-- line_id aparece en `waybill` (albarán) y en la `invoice` agregada de fin de
-- mes que Holded crea juntando los albaranes del cliente. Mismo line_id, dos
-- documentos distintos → duplicate key.
--
-- Nueva PK: (factura_id, id). Una línea es única dentro de su factura.
-- ============================================================================

-- Vaciar para evitar conflictos durante el cambio de PK (la cache se reconstruye
-- desde Holded; manager_facturas se trunca también para mantener integridad
-- referencial limpia y forzar re-backfill consistente).
truncate table public.manager_lineas;
truncate table public.manager_facturas cascade;
truncate table public.manager_contactos cascade;

alter table public.manager_lineas drop constraint if exists manager_lineas_pkey;
alter table public.manager_lineas add constraint manager_lineas_pkey primary key (factura_id, id);
