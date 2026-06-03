-- RPCs para la pestaña "Mapeo de costes" (admin). Convención Manager: definer + puede_ver_manager().
create or replace function manager_compras_sin_mapear()
returns table(nombre_compra text, lineas bigint, gasto_eur numeric, coste_ud_mediano numeric, provs bigint)
language sql security definer set search_path = public stable as $$
  select lower(trim(l.nombre)),
         count(*),
         round(sum(l.subtotal), 2),
         round((percentile_cont(0.5) within group (order by l.subtotal / nullif(l.units,0)))::numeric, 3),
         count(distinct f.contact_name)
  from manager_lineas l
  join manager_facturas f on f.id = l.factura_id
  where puede_ver_manager()
    and f.tipo = 'COMPRA' and l.product_id is null and f.fecha >= current_date - 30
    and not exists (select 1 from manager_compra_alias a where a.nombre_compra_norm = lower(trim(l.nombre)))
  group by 1
  having sum(l.subtotal) > 20
  order by 3 desc;
$$;

create or replace function manager_compra_alias_list()
returns table(nombre_compra_norm text, holded_product_id text, producto text,
              factor_unidad numeric, coste_fijo numeric, coste_resultante numeric,
              gasto_eur numeric, activo boolean)
language sql security definer set search_path = public stable as $$
  with compra as (
    select lower(trim(l.nombre)) nombre,
           round((percentile_cont(0.5) within group (order by l.subtotal / nullif(l.units,0)))::numeric, 3) coste_ud,
           round(sum(l.subtotal), 2) gasto
    from manager_lineas l
    join manager_facturas f on f.id = l.factura_id
    where f.tipo = 'COMPRA' and l.product_id is null and f.fecha >= current_date - 30
    group by 1
  )
  select a.nombre_compra_norm, a.holded_product_id,
         (select p.holded_product_name from pedidos_wa_productos_holded p
           where p.holded_product_id = a.holded_product_id limit 1),
         a.factor_unidad, a.coste_fijo,
         round(coalesce(a.coste_fijo, c.coste_ud / nullif(a.factor_unidad,0))::numeric, 3),
         c.gasto, a.activo
  from manager_compra_alias a
  left join compra c on c.nombre = a.nombre_compra_norm
  where puede_ver_manager()
  order by c.gasto desc nulls last;
$$;

grant execute on function manager_compras_sin_mapear() to authenticated;
grant execute on function manager_compra_alias_list() to authenticated;
