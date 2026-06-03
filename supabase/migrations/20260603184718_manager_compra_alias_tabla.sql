-- Mapeo canónico: nombre de línea de compra (proveedor) -> producto Holded + unidad.
-- Resuelve que las compras vía Fact Prov entran sin product_id y con nombres libres.
-- coste_kg = coalesce(coste_fijo, coste_ud_compra / factor_unidad).
create table if not exists manager_compra_alias (
  nombre_compra_norm text primary key,
  holded_product_id  text not null,
  factor_unidad      numeric(10,4) not null default 1,
  coste_fijo         numeric(12,4),
  nota               text,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_manager_compra_alias_pid on manager_compra_alias(holded_product_id);

alter table manager_compra_alias enable row level security;

create policy "manager_compra_alias: admin rw"
  on manager_compra_alias for all
  using (is_admin()) with check (is_admin());

create policy "manager_compra_alias: manager read"
  on manager_compra_alias for select
  using (puede_ver_manager());

create or replace function manager_compra_alias_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger manager_compra_alias_touch
  before update on manager_compra_alias
  for each row execute function manager_compra_alias_touch();
