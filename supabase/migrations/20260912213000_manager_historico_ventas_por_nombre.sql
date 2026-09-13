-- El histórico de ventas comparte la identidad del listado e incluye abonos.
-- Las compras conservan su resolución por catálogo/alias y unidad.
create or replace function public.manager_producto_historico_nombre(p_nombre text, p_meses integer default 12)
 returns table(mes date, unidades_vendidas numeric, ventas numeric, precio_venta_medio numeric, unidades_compradas numeric, compras numeric, precio_compra_medio numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with objetivo as (
    select coalesce(
      (
        select p.holded_product_id
        from public.pedidos_wa_productos_holded p
        where p.holded_product_id <> '0'
          and (
            lower(trim(p_nombre)) = lower(trim(p.holded_product_name))
            or lower(trim(p_nombre)) = p.producto_normalizado
          )
        order by case when p.source = 'manual' then 0 else 1 end, p.updated_at desc
        limit 1
      ),
      (
        select a.holded_product_id
        from public.manager_compra_alias a
        where a.activo
          and a.holded_product_id is not null
          and a.factor_unidad > 0
          and (
            a.nombre_compra_norm = lower(trim(p_nombre))
            or public.manager_norm_nombre(a.nombre_compra_norm)
               = public.manager_norm_nombre(lower(trim(p_nombre)))
          )
        order by (a.nombre_compra_norm = lower(trim(p_nombre))) desc, a.nombre_compra_norm
        limit 1
      )
    ) as product_id
  ),
  meses as (
    select generate_series(
      date_trunc('month', current_date) - ((p_meses - 1) || ' month')::interval,
      date_trunc('month', current_date),
      '1 month'::interval
    )::date as mes
  ),
  ventas_m as (
    select date_trunc('month', r.fecha)::date as mes, sum(r.units) as units, sum(r.subtotal) as importe
    from public.manager_lineas_efectivas r
    where public.manager_norm_nombre(coalesce(nullif(trim(r.nombre), ''), '(sin nombre)'))
      = public.manager_norm_nombre(p_nombre)
      and public.puede_ver_manager()
    group by 1
  ),
  compras_m as (
    select date_trunc('month', r.fecha)::date as mes, sum(r.unidades_producto) as units, sum(r.importe_coste) as importe
    from public.manager_lineas_producto_resueltas r
    cross join objetivo o
    where r.tipo = 'COMPRA'
      and r.unidades_producto > 0
      and r.importe_coste > 0
      and (
        (o.product_id is not null and r.product_id_resuelto = o.product_id)
        or (o.product_id is null and public.manager_norm_nombre(r.nombre) = public.manager_norm_nombre(p_nombre))
      )
      and public.puede_ver_manager()
    group by 1
  )
  select
    m.mes,
    coalesce(v.units, 0),
    coalesce(v.importe, 0),
    case when coalesce(v.units, 0) > 0 then (v.importe / v.units)::numeric(12,4) else null end,
    coalesce(c.units, 0),
    coalesce(c.importe, 0),
    case when coalesce(c.units, 0) > 0 then (c.importe / c.units)::numeric(12,4) else null end
  from meses m
  left join ventas_m v on v.mes = m.mes
  left join compras_m c on c.mes = m.mes
  order by m.mes;
$function$;
