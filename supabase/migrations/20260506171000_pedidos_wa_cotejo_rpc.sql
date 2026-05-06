-- Cotejo agregado pedido vs inventario para un día.
-- Las unidades 'caja' y 'kg' se unifican en 'kg' usando factor de
-- pedidos_wa_kg_por_caja (default 10). Otras unidades se dejan tal cual.
-- Match producto se hace case-insensitive (lower).
drop function if exists public.pedidos_wa_cotejo(date);
create or replace function public.pedidos_wa_cotejo(p_fecha date)
returns table (
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
language sql security invoker stable as $$
  with
  ped as (
    select
      pl.producto_normalizado as producto,
      pl.unidad,
      sum(pl.cantidad)::numeric as cantidad
    from public.pedidos_wa_lineas pl
    join public.pedidos_wa p on p.id = pl.pedido_id
    where p.fecha = p_fecha
      and p.estado <> 'cancelado'
    group by pl.producto_normalizado, pl.unidad
  ),
  inv as (
    select
      l.producto_normalizado as producto,
      l.unidad,
      sum(l.cantidad)::numeric as cantidad
    from public.pedidos_wa_inventario_lineas l
    where l.fecha = p_fecha
    group by l.producto_normalizado, l.unidad
  ),
  combinados as (
    select
      coalesce(p.producto, i.producto) as producto,
      coalesce(p.unidad, i.unidad)     as unidad,
      coalesce(p.cantidad, 0)          as ped_qty,
      coalesce(i.cantidad, 0)          as inv_qty
    from ped p
    full outer join inv i
      on lower(i.producto) = lower(p.producto) and i.unidad = p.unidad
  ),
  con_factor as (
    select
      c.*,
      coalesce(k.kg_por_caja, 10) as factor
    from combinados c
    left join public.pedidos_wa_kg_por_caja k
      on k.producto_normalizado = lower(c.producto)
  ),
  kgs as (
    select
      producto,
      'kg'::text as unidad,
      sum(case when unidad = 'caja' then ped_qty * factor else ped_qty end)::numeric as ped_qty,
      sum(case when unidad = 'caja' then inv_qty * factor else inv_qty end)::numeric as inv_qty,
      max(factor) as factor
    from con_factor
    where unidad in ('caja','kg')
    group by producto
  ),
  otras as (
    select
      producto,
      unidad,
      ped_qty,
      inv_qty,
      null::numeric as factor
    from con_factor
    where unidad not in ('caja','kg')
  ),
  unidos as (
    select producto, unidad, ped_qty, inv_qty, factor from kgs
    union all
    select producto, unidad, ped_qty, inv_qty, factor from otras
  )
  select
    producto,
    unidad,
    ped_qty                                  as pedido_total,
    inv_qty                                  as inventario,
    greatest(ped_qty - inv_qty, 0)::numeric  as a_comprar,
    greatest(inv_qty - ped_qty, 0)::numeric  as sobra,
    factor                                   as kg_por_caja,
    case when unidad = 'kg' and factor is not null
         then round(ped_qty / factor, 2) end as pedido_cajas,
    case when unidad = 'kg' and factor is not null
         then round(inv_qty / factor, 2) end as inventario_cajas,
    case when unidad = 'kg' and factor is not null
         then round(greatest(ped_qty - inv_qty, 0) / factor, 2) end as a_comprar_cajas
  from unidos
  order by a_comprar desc, producto;
$$;

grant execute on function public.pedidos_wa_cotejo(date) to authenticated;
