-- La lista muestra el coste vivo, como manager_producto_coste.
-- Los overrides por nombre caducados no deben ocultar las compras actuales
-- ni marcar el producto como manual. El margen histórico no se modifica.
CREATE OR REPLACE FUNCTION public.manager_productos_lista(p_from date, p_to date)
 RETURNS TABLE(product_id text, nombre text, veces bigint, unidades numeric, ventas numeric, ventas_subtotal numeric, cogs numeric, margen numeric, margen_pct numeric, coste_unidad numeric, es_coste_manual boolean, ultima_compra date, ultima_venta date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with agg as (
    select
      max(l.product_id) as product_id_original,
      mode() within group (order by coalesce(nullif(trim(l.nombre), ''), '(sin nombre)')) as nombre,
      count(*) as veces,
      coalesce(sum(l.units), 0) as unidades,
      coalesce(sum(l.total_linea), 0) as ventas,
      coalesce(sum(l.subtotal), 0) as ventas_subtotal,
      coalesce(sum(l.cogs_linea), 0) as cogs,
      coalesce(sum(l.margen_linea), 0) as margen,
      case when sum(l.subtotal_con_coste) > 0
        then round((sum(l.margen_linea) / sum(l.subtotal_con_coste)) * 100, 1)
        else null
      end as margen_pct,
      max(l.coste_unidad) as max_coste_linea,
      max(l.fecha) as ultima_venta
    from public.manager_lineas_efectivas l
    where l.fecha between p_from and p_to
      and public.puede_ver_manager()
    group by public.manager_norm_nombre(coalesce(nullif(trim(l.nombre), ''), '(sin nombre)'))
  ),
  productos as (
    select
      agg.*,
      coalesce(agg.product_id_original, ph.holded_product_id) as pid
    from agg
    left join lateral (
      select p.holded_product_id
      from public.pedidos_wa_productos_holded p
      where agg.product_id_original is null
        and p.holded_product_id <> '0'
        and (
          lower(trim(agg.nombre)) = lower(trim(p.holded_product_name))
          or lower(trim(agg.nombre)) = p.producto_normalizado
        )
      order by case when p.source = 'manual' then 0 else 1 end, p.updated_at desc
      limit 1
    ) ph on true
  )
  select
    p.pid,
    p.nombre,
    p.veces,
    p.unidades,
    p.ventas,
    p.ventas_subtotal,
    p.cogs,
    p.margen,
    p.margen_pct,
    coalesce(
      mcn.coste_eur,
      case when pc.es_manual then pc.coste_eur end,
      cac.coste_eur,
      cpc.coste_eur,
      cnc.coste_eur,
      pc.coste_eur,
      p.max_coste_linea
    )::numeric as coste_unidad,
    (mcn.nombre_norm is not null or coalesce(pc.es_manual, false)) as es_coste_manual,
    coalesce(cr.ultima_compra, cac.ultima_compra, pc.ultima_compra) as ultima_compra,
    p.ultima_venta
  from productos p
  left join public.manager_costes_manuales_nombre mcn
    on mcn.nombre_norm = lower(trim(p.nombre))
   and (mcn.fecha_hasta is null or mcn.fecha_hasta >= current_date)
  left join public.manager_producto_coste pc on pc.product_id = p.pid
  left join public.manager_coste_alias_calc cac on cac.product_id = p.pid
  left join public.manager_producto_compra_resumen cr on cr.product_id = p.pid
  left join public.manager_coste_producto_calc cpc on cpc.product_id = p.pid
  left join public.manager_coste_nombre_calc cnc on cnc.nombre_norm = lower(trim(p.nombre))
  order by p.ventas_subtotal desc nulls last;
$function$
;

