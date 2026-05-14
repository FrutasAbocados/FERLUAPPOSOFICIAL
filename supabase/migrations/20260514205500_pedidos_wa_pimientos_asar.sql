-- ============================================================================
-- Pedidos WA · pim rojo/verde deben ir a pimiento asar, no california
-- ============================================================================

update public.pedidos_wa_abreviaturas
set producto_normalizado = 'Pimiento rojo asar kg'
where lower(trim(abreviatura)) = 'pim rojo';

insert into public.pedidos_wa_abreviaturas (abreviatura, producto_normalizado)
values ('pim rojo', 'Pimiento rojo asar kg')
on conflict (abreviatura) do update
  set producto_normalizado = excluded.producto_normalizado;

update public.pedidos_wa_abreviaturas
set producto_normalizado = 'Pimiento verde asar kg'
where lower(trim(abreviatura)) = 'pim verde';

insert into public.pedidos_wa_abreviaturas (abreviatura, producto_normalizado)
values ('pim verde', 'Pimiento verde asar kg')
on conflict (abreviatura) do update
  set producto_normalizado = excluded.producto_normalizado;

with rojo as (
  select distinct on (ml.product_id)
    ml.product_id,
    ml.nombre
  from public.manager_lineas ml
  where ml.product_id is not null
    and lower(ml.nombre) like '%pimiento%'
    and lower(ml.nombre) like '%rojo%'
    and lower(ml.nombre) like '%asar%'
  order by ml.product_id, ml.fecha desc nulls last
),
pick as (
  select product_id, nombre
  from rojo
  order by lower(nombre) like '%kg%' desc, nombre
  limit 1
)
insert into public.pedidos_wa_productos_holded
  (producto_normalizado, holded_product_id, holded_product_name, source)
select 'pimiento rojo asar kg', product_id, nombre, 'manual'
from pick
on conflict (producto_normalizado) do update
  set holded_product_id = excluded.holded_product_id,
      holded_product_name = excluded.holded_product_name,
      source = 'manual',
      updated_at = now();

with verde as (
  select distinct on (ml.product_id)
    ml.product_id,
    ml.nombre
  from public.manager_lineas ml
  where ml.product_id is not null
    and lower(ml.nombre) like '%pimiento%'
    and lower(ml.nombre) like '%verde%'
    and lower(ml.nombre) like '%asar%'
  order by ml.product_id, ml.fecha desc nulls last
),
pick as (
  select product_id, nombre
  from verde
  order by lower(nombre) like '%kg%' desc, nombre
  limit 1
)
insert into public.pedidos_wa_productos_holded
  (producto_normalizado, holded_product_id, holded_product_name, source)
select 'pimiento verde asar kg', product_id, nombre, 'manual'
from pick
on conflict (producto_normalizado) do update
  set holded_product_id = excluded.holded_product_id,
      holded_product_name = excluded.holded_product_name,
      source = 'manual',
      updated_at = now();
