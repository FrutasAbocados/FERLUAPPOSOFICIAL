-- Añade conversión unidad→kg a la tabla kg_por_caja
-- y reescribe pedidos_wa_cotejo para manejar ambos tipos de conversión.

alter table public.pedidos_wa_kg_por_caja
  alter column kg_por_caja drop not null;

alter table public.pedidos_wa_kg_por_caja
  add column if not exists unidades_por_kg numeric;

-- limón: 4 unidades = 1 kg
insert into public.pedidos_wa_kg_por_caja (producto_normalizado, unidades_por_kg)
values ('limon', 4)
on conflict (producto_normalizado) do update
  set unidades_por_kg = excluded.unidades_por_kg;

-- Reescribir cotejo con dual lookup y conversión unidad→kg
create or replace function public.pedidos_wa_cotejo(p_fecha date)
returns table(
  producto         text,
  unidad           text,
  pedido_total     numeric,
  inventario       numeric,
  a_comprar        numeric,
  sobra            numeric,
  kg_por_caja      numeric,
  pedido_cajas     numeric,
  inventario_cajas numeric,
  a_comprar_cajas  numeric
)
language sql stable as $$
  with
  ped as (
    select
      coalesce(ph.holded_product_id, lower(pl.producto_normalizado)) as group_key,
      coalesce(ph.holded_product_name, pl.producto_normalizado)       as producto,
      pl.unidad,
      sum(pl.cantidad)::numeric as cantidad
    from public.pedidos_wa_lineas pl
    join public.pedidos_wa p on p.id = pl.pedido_id
    left join public.pedidos_wa_productos_holded ph
      on ph.producto_normalizado = lower(pl.producto_normalizado)
    where p.fecha = p_fecha
      and p.estado <> 'cancelado'
    group by coalesce(ph.holded_product_id, lower(pl.producto_normalizado)),
             coalesce(ph.holded_product_name, pl.producto_normalizado),
             pl.unidad
  ),
  inv as (
    select
      coalesce(ph.holded_product_id, lower(l.producto_normalizado)) as group_key,
      coalesce(ph.holded_product_name, l.producto_normalizado)       as producto,
      l.unidad,
      sum(l.cantidad)::numeric as cantidad
    from public.pedidos_wa_inventario_lineas l
    left join public.pedidos_wa_productos_holded ph
      on ph.producto_normalizado = lower(l.producto_normalizado)
    where l.fecha = p_fecha
    group by coalesce(ph.holded_product_id, lower(l.producto_normalizado)),
             coalesce(ph.holded_product_name, l.producto_normalizado),
             l.unidad
  ),
  combinados as (
    select
      coalesce(p.producto, i.producto) as producto,
      coalesce(p.unidad,   i.unidad)   as unidad,
      coalesce(p.cantidad, 0)          as ped_qty,
      coalesce(i.cantidad, 0)          as inv_qty
    from ped p
    full outer join inv i on i.group_key = p.group_key and i.unidad = p.unidad
  ),
  con_factor as (
    select
      c.*,
      coalesce(
        (select kg_por_caja from public.pedidos_wa_kg_por_caja
         where producto_normalizado = lower(c.producto) limit 1),
        (select k.kg_por_caja
         from public.pedidos_wa_productos_holded ph
         join public.pedidos_wa_kg_por_caja k on k.producto_normalizado = ph.producto_normalizado
         where ph.holded_product_name = c.producto limit 1),
        10
      ) as factor,
      coalesce(
        (select unidades_por_kg from public.pedidos_wa_kg_por_caja
         where producto_normalizado = lower(c.producto) limit 1),
        (select k.unidades_por_kg
         from public.pedidos_wa_productos_holded ph
         join public.pedidos_wa_kg_por_caja k on k.producto_normalizado = ph.producto_normalizado
         where ph.holded_product_name = c.producto limit 1)
      ) as unidades_por_kg
    from combinados c
  ),
  kgs as (
    select
      producto,
      'kg'::text as unidad,
      sum(case
        when unidad = 'caja'   then ped_qty * factor
        when unidad = 'unidad' then ped_qty / unidades_por_kg
        else ped_qty
      end)::numeric as ped_qty,
      sum(case
        when unidad = 'caja'   then inv_qty * factor
        when unidad = 'unidad' then inv_qty / unidades_por_kg
        else inv_qty
      end)::numeric as inv_qty,
      max(factor) as factor
    from con_factor
    where unidad in ('caja','kg')
       or (unidad = 'unidad' and unidades_por_kg is not null)
    group by producto
  ),
  otras as (
    select producto, unidad, ped_qty, inv_qty, null::numeric as factor
    from con_factor
    where unidad not in ('caja','kg')
      and not (unidad = 'unidad' and unidades_por_kg is not null)
  ),
  unidos as (
    select producto, unidad, ped_qty, inv_qty, factor from kgs
    union all
    select producto, unidad, ped_qty, inv_qty, factor from otras
  )
  select
    producto,
    unidad,
    ped_qty                                                          as pedido_total,
    inv_qty                                                          as inventario,
    greatest(ped_qty - inv_qty, 0)::numeric                         as a_comprar,
    greatest(inv_qty - ped_qty, 0)::numeric                         as sobra,
    factor                                                           as kg_por_caja,
    case when unidad='kg' and factor is not null
         then round(ped_qty / factor, 2) end                        as pedido_cajas,
    case when unidad='kg' and factor is not null
         then round(inv_qty / factor, 2) end                        as inventario_cajas,
    case when unidad='kg' and factor is not null
         then round(greatest(ped_qty - inv_qty, 0) / factor, 2) end as a_comprar_cajas
  from unidos
  order by a_comprar desc, producto;
$$;
