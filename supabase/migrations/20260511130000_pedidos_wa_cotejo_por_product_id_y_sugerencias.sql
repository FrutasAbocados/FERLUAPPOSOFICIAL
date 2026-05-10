-- 1) Habilitar pg_trgm para similitud de texto
create extension if not exists pg_trgm;

-- 2) Reescribe cotejo para agregar por holded_product_id cuando el producto
--    está mapeado. "naranja" y "naranjas" (mismo holded_product_id) suman en
--    la misma fila. Productos sin mapear siguen con su nombre raw.
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
    full outer join inv i
      on i.group_key = p.group_key and i.unidad = p.unidad
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
    select producto, unidad, ped_qty, inv_qty, null::numeric as factor
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

grant execute on function public.pedidos_wa_cotejo(date) to authenticated;

-- 3) RPC para detectar productos sin mapear y sugerir el mejor match via trgm
create or replace function public.pedidos_wa_sugerencias_mapeo()
returns table (
  producto_raw           text,
  fuente                 text,
  veces                  bigint,
  sugerencia_normalizado text,
  sugerencia_holded_id   text,
  sugerencia_nombre      text,
  confianza              numeric
)
language sql security invoker stable as $$
  with
  sin_mapeo_pedidos as (
    select lower(pl.producto_normalizado) as prod, 'pedido'::text as fuente, count(*) as veces
    from public.pedidos_wa_lineas pl
    join public.pedidos_wa p on p.id = pl.pedido_id
    where p.fecha >= current_date - 60
      and lower(pl.producto_normalizado) not in (
        select producto_normalizado from public.pedidos_wa_productos_holded
      )
    group by 1
  ),
  sin_mapeo_inv as (
    select lower(l.producto_normalizado) as prod, 'inventario'::text as fuente, count(*) as veces
    from public.pedidos_wa_inventario_lineas l
    where l.fecha >= current_date - 60
      and lower(l.producto_normalizado) not in (
        select producto_normalizado from public.pedidos_wa_productos_holded
      )
    group by 1
  ),
  sin_mapeo as (
    select prod, fuente, veces from sin_mapeo_pedidos
    union all
    select prod, fuente, veces from sin_mapeo_inv
  ),
  con_sugerencia as (
    select
      s.prod    as producto_raw,
      s.fuente,
      s.veces,
      ph.producto_normalizado  as sugerencia_normalizado,
      ph.holded_product_id     as sugerencia_holded_id,
      ph.holded_product_name   as sugerencia_nombre,
      similarity(s.prod, ph.producto_normalizado)::numeric(4,3) as confianza
    from sin_mapeo s
    cross join public.pedidos_wa_productos_holded ph
  ),
  mejores as (
    select distinct on (producto_raw, fuente)
      producto_raw, fuente, veces,
      sugerencia_normalizado, sugerencia_holded_id, sugerencia_nombre, confianza
    from con_sugerencia
    order by producto_raw, fuente, confianza desc
  )
  select * from mejores
  order by veces desc, confianza desc;
$$;

grant execute on function public.pedidos_wa_sugerencias_mapeo() to authenticated;
