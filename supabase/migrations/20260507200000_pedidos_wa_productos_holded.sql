-- Mapeo producto_normalizado (texto del parser WA) → product_id Holded.
-- Sin esto la edge sube cada línea con `name` libre y Holded crea producto
-- nuevo en el catálogo en cada subida. Con esto reusa el del catálogo.

create table if not exists public.pedidos_wa_productos_holded (
  producto_normalizado  text primary key,
  holded_product_id     text not null,
  holded_product_name   text not null,
  source                text not null default 'manual'
                          check (source in ('auto_match','manual')),
  updated_at            timestamptz not null default now()
);

create or replace function public.pedidos_wa_productos_holded_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists pedidos_wa_productos_holded_touch_t on public.pedidos_wa_productos_holded;
create trigger pedidos_wa_productos_holded_touch_t
  before update on public.pedidos_wa_productos_holded
  for each row execute function public.pedidos_wa_productos_holded_touch();

alter table public.pedidos_wa_productos_holded enable row level security;

drop policy if exists "productos_holded: admin rw" on public.pedidos_wa_productos_holded;
create policy "productos_holded: admin rw"
  on public.pedidos_wa_productos_holded for all
  using (is_admin())
  with check (is_admin());

drop policy if exists "productos_holded: responsable read" on public.pedidos_wa_productos_holded;
create policy "productos_holded: responsable read"
  on public.pedidos_wa_productos_holded for select
  using (es_responsable());

-- Auto-rellenar con match único: producto_normalizado WA que solo coincide
-- con UN product_id distinto en manager_lineas (VENTA).
with lineas_wa as (
  select distinct lower(trim(producto_normalizado)) as nom
  from public.pedidos_wa_lineas
  where producto_normalizado is not null
),
holded_prods_unicos as (
  select lower(trim(nombre)) as nom_norm,
         min(product_id) as product_id,
         min(nombre) as nombre_holded,
         count(distinct product_id) as ids
  from public.manager_lineas
  where product_id is not null and tipo = 'VENTA'
  group by lower(trim(nombre))
  having count(distinct product_id) = 1
),
matches as (
  select
    l.nom as producto_normalizado,
    h.product_id,
    h.nombre_holded
  from lineas_wa l
  join holded_prods_unicos h
    on h.nom_norm = l.nom
    or h.nom_norm like l.nom || ' %'
    or h.nom_norm like l.nom || '%'
),
matches_unicos as (
  select producto_normalizado,
         min(product_id) as holded_product_id,
         min(nombre_holded) as holded_product_name
  from matches
  group by producto_normalizado
  having count(distinct product_id) = 1
)
insert into public.pedidos_wa_productos_holded
  (producto_normalizado, holded_product_id, holded_product_name, source)
select producto_normalizado, holded_product_id, holded_product_name, 'auto_match'
from matches_unicos
on conflict (producto_normalizado) do nothing;

grant select on public.pedidos_wa_productos_holded to authenticated;
