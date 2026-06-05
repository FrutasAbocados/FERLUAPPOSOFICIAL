create or replace function public.pedidos_wa_faltas_sugeridas(p_fecha date)
returns table (
  pedido_id uuid,
  faltas_sugeridas text
)
language sql
security invoker
stable
set search_path = public
as $$
with factores as (
  select distinct on (lower(ph.producto_normalizado))
    lower(ph.producto_normalizado) as producto_norm,
    ph.holded_product_id,
    ph.holded_product_name,
    coalesce(k.kg_por_caja, 10) as kg_por_caja,
    k.unidades_por_kg
  from public.pedidos_wa_productos_holded ph
  left join public.pedidos_wa_kg_por_caja k
    on k.producto_normalizado = lower(ph.producto_normalizado)
  order by lower(ph.producto_normalizado),
    case when ph.source = 'manual' then 0 else 1 end,
    ph.updated_at desc
),
inventario as (
  select
    coalesce(f.holded_product_id, lower(i.producto_normalizado)) as product_key,
    case
      when i.unidad in ('caja','kg') then 'kg'
      when i.unidad = 'unidad' and f.unidades_por_kg is not null then 'kg'
      else i.unidad
    end as unidad_base,
    sum(case
      when i.unidad = 'caja' then i.cantidad * coalesce(f.kg_por_caja, 10)
      when i.unidad = 'unidad' and f.unidades_por_kg is not null then i.cantidad / f.unidades_por_kg
      else i.cantidad
    end)::numeric as cantidad
  from public.pedidos_wa_inventario_lineas i
  left join factores f on f.producto_norm = lower(i.producto_normalizado)
  where i.fecha = p_fecha
  group by 1, 2
),
lineas as (
  select
    p.id as pedido_id,
    l.id as linea_id,
    l.orden as linea_orden,
    l.producto_normalizado,
    l.unidad,
    coalesce(f.holded_product_id, lower(l.producto_normalizado)) as product_key,
    case
      when l.unidad in ('caja','kg') then 'kg'
      when l.unidad = 'unidad' and f.unidades_por_kg is not null then 'kg'
      else l.unidad
    end as unidad_base,
    case
      when l.unidad = 'caja' then l.cantidad * coalesce(f.kg_por_caja, 10)
      when l.unidad = 'unidad' and f.unidades_por_kg is not null then l.cantidad / f.unidades_por_kg
      else l.cantidad
    end::numeric as cantidad_base,
    case
      when l.unidad = 'caja' then coalesce(f.kg_por_caja, 10)
      when l.unidad = 'unidad' and f.unidades_por_kg is not null then 1 / f.unidades_por_kg
      else 1
    end::numeric as factor_salida,
    row_number() over (
      order by
        case coalesce(p.override_repartidor, c.repartidor)
          when 'TORRES' then 1 when 'GERMAN' then 2 when 'RAUL' then 3 else 4 end,
        case coalesce(p.override_salida, c.salida, 'PRIMERA') when 'PRIMERA' then 1 else 2 end,
        coalesce(p.override_orden, 9999),
        coalesce(p.override_horario, c.horario, '99:99'),
        p.created_at,
        l.orden
    ) as ruta_orden
  from public.pedidos_wa p
  join public.pedidos_wa_clientes c on c.id = p.cliente_id
  join public.pedidos_wa_lineas l on l.pedido_id = p.id
  left join factores f on f.producto_norm = lower(l.producto_normalizado)
  where p.fecha = p_fecha and p.estado <> 'cancelado'
),
consumo as (
  select
    l.*,
    coalesce(i.cantidad, 0) as inventario,
    coalesce(sum(l.cantidad_base) over (
      partition by l.product_key, l.unidad_base
      order by l.ruta_orden
      rows between unbounded preceding and 1 preceding
    ), 0) as consumido_antes
  from lineas l
  left join inventario i using (product_key, unidad_base)
),
faltas as (
  select
    pedido_id,
    linea_orden,
    greatest(cantidad_base - greatest(inventario - consumido_antes, 0), 0) / nullif(factor_salida, 0) as falta,
    unidad,
    producto_normalizado
  from consumo
)
select
  pedido_id,
  string_agg(
    trim(to_char(falta, 'FM999999990.##')) || ' ' || unidad || ' ' || producto_normalizado,
    ' / ' order by linea_orden
  ) as faltas_sugeridas
from faltas
where falta > 0
group by pedido_id
order by pedido_id;
$$;

grant execute on function public.pedidos_wa_faltas_sugeridas(date) to authenticated;

create or replace function public.pedidos_wa_compra_operativa(p_fecha date)
returns table (
  producto text,
  producto_key text,
  unidad text,
  pedido_total numeric,
  inventario numeric,
  a_comprar numeric,
  sobra numeric,
  kg_por_caja numeric,
  pedido_cajas numeric,
  inventario_cajas numeric,
  a_comprar_cajas numeric,
  proveedor text,
  proveedor_fuente text
)
language sql
security invoker
stable
set search_path = public
as $$
with cotejo as (
  select * from public.pedidos_wa_cotejo(p_fecha)
),
keys as (
  select
    c.*,
    lower(c.producto) as producto_key,
    ph.holded_product_id
  from cotejo c
  left join lateral (
    select ph.holded_product_id
    from public.pedidos_wa_productos_holded ph
    where ph.holded_product_name = c.producto
    order by case when ph.source = 'manual' then 0 else 1 end, ph.updated_at desc
    limit 1
  ) ph on true
),
historico as (
  select distinct on (k.producto_key)
    k.producto_key,
    case
      when lower(mf.contact_name) like '%abasthosur%' then 'abasthosur'
      when lower(mf.contact_name) like '%alcalde%' then 'alcalde'
      else 'mercado'
    end as proveedor
  from keys k
  join public.manager_lineas ml
    on (k.holded_product_id is not null and ml.product_id = k.holded_product_id)
    or lower(ml.nombre) = lower(k.producto)
  join public.manager_facturas mf on mf.id = ml.factura_id and mf.tipo = 'COMPRA'
  order by k.producto_key, mf.fecha desc nulls last, mf.updated_at desc
)
select
  k.producto,
  k.producto_key,
  k.unidad,
  k.pedido_total,
  k.inventario,
  k.a_comprar,
  k.sobra,
  k.kg_por_caja,
  k.pedido_cajas,
  k.inventario_cajas,
  k.a_comprar_cajas,
  coalesce(pp.proveedor, h.proveedor, 'alcalde') as proveedor,
  case when pp.proveedor is not null then 'manual'
       when h.proveedor is not null then 'historico'
       else 'default' end as proveedor_fuente
from keys k
left join public.pedidos_wa_producto_proveedor pp on pp.producto_key = k.producto_key
left join historico h on h.producto_key = k.producto_key
order by coalesce(pp.proveedor, h.proveedor, 'alcalde'), k.a_comprar desc, k.producto;
$$;

grant execute on function public.pedidos_wa_compra_operativa(date) to authenticated;
