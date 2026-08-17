-- Aprovechar equivalencias que ya fueron enlazadas manualmente en el catalogo
-- de Pedidos WA y cuya descripcion de compra coincide de forma exacta con un
-- unico producto. No se tocan coincidencias aproximadas ni aliases existentes.

with nombres(nombre_compra_norm) as (
  values
    ('aguacate terreno'::text),
    ('lechuga batavia'::text),
    ('eneldo'::text),
    ('apio verde'::text),
    ('romero'::text),
    ('escarolas'::text),
    ('estragon'::text),
    ('tomillo'::text),
    ('menta'::text)
),
resueltos as (
  select
    n.nombre_compra_norm,
    min(p.holded_product_id) as holded_product_id
  from nombres n
  join public.pedidos_wa_productos_holded p
    on p.source = 'manual'
   and p.holded_product_id <> '0'
   and (
     lower(trim(p.producto_normalizado)) = n.nombre_compra_norm
     or lower(trim(p.holded_product_name)) = n.nombre_compra_norm
   )
  group by n.nombre_compra_norm
  having count(distinct p.holded_product_id) = 1
)
insert into public.manager_compra_alias (
  nombre_compra_norm,
  holded_product_id,
  factor_unidad,
  coste_fijo,
  nota,
  activo
)
select
  nombre_compra_norm,
  holded_product_id,
  1,
  null,
  'Equivalencia exacta ya validada manualmente en Pedidos WA',
  true
from resueltos
on conflict (nombre_compra_norm) do nothing;

select public.manager_refresh_coste_alias();
select public.manager_refresh_costes_calc();
