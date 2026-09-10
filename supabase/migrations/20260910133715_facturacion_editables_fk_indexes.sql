-- Indices de soporte para las FK de autoria de A3. Evitan escaneos completos
-- al consultar actividad o al aplicar ON DELETE SET NULL sobre auth.users.

create index facturacion_borradores_created_by_idx
  on public.facturacion_borradores (created_by)
  where created_by is not null;
create index facturacion_borradores_updated_by_idx
  on public.facturacion_borradores (updated_by)
  where updated_by is not null;

create index facturacion_borrador_lineas_created_by_idx
  on public.facturacion_borrador_lineas (created_by)
  where created_by is not null;
create index facturacion_borrador_lineas_updated_by_idx
  on public.facturacion_borrador_lineas (updated_by)
  where updated_by is not null;

create index facturacion_albaranes_created_by_idx
  on public.facturacion_albaranes (created_by)
  where created_by is not null;
create index facturacion_albaranes_updated_by_idx
  on public.facturacion_albaranes (updated_by)
  where updated_by is not null;

create index facturacion_albaran_lineas_created_by_idx
  on public.facturacion_albaran_lineas (created_by)
  where created_by is not null;
create index facturacion_albaran_lineas_updated_by_idx
  on public.facturacion_albaran_lineas (updated_by)
  where updated_by is not null;

create index facturacion_eventos_actor_idx
  on public.facturacion_eventos_editables (actor_id)
  where actor_id is not null;
