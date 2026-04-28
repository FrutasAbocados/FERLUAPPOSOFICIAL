-- ============================================================================
-- Manager — Histórico mensual de un producto (ventas + compras + precios)
-- ============================================================================

create or replace function public.manager_producto_historico(
  p_product_id text, p_meses int default 12
)
returns table(
  mes              date,
  unidades_vendidas numeric,
  ventas           numeric,
  precio_venta_medio numeric,
  unidades_compradas numeric,
  compras          numeric,
  precio_compra_medio numeric
) language sql security invoker stable as $$
  with meses as (
    select generate_series(
      date_trunc('month', current_date) - ((p_meses - 1) || ' month')::interval,
      date_trunc('month', current_date),
      '1 month'::interval
    )::date as mes
  ),
  ventas_m as (
    select date_trunc('month', l.fecha)::date as mes,
           sum(l.units) as units,
           sum(l.subtotal) as importe
    from public.manager_lineas l
    join public.manager_ventas_efectivas e on e.id = l.factura_id
    where l.product_id = p_product_id
      and l.units > 0
    group by 1
  ),
  compras_m as (
    select date_trunc('month', l.fecha)::date as mes,
           sum(l.units) as units,
           sum(l.subtotal) as importe
    from public.manager_lineas l
    where l.product_id = p_product_id
      and l.tipo = 'COMPRA'
      and l.units > 0
    group by 1
  )
  select
    m.mes,
    coalesce(v.units, 0)                                       as unidades_vendidas,
    coalesce(v.importe, 0)                                     as ventas,
    case when coalesce(v.units, 0) > 0 then (v.importe / v.units)::numeric(12,4) else null end as precio_venta_medio,
    coalesce(c.units, 0)                                       as unidades_compradas,
    coalesce(c.importe, 0)                                     as compras,
    case when coalesce(c.units, 0) > 0 then (c.importe / c.units)::numeric(12,4) else null end as precio_compra_medio
  from meses m
  left join ventas_m v on v.mes = m.mes
  left join compras_m c on c.mes = m.mes
  order by m.mes;
$$;
