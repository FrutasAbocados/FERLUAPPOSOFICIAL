-- Mismas claves normalizadas en histórico, compras y productos por cliente, para
-- que el detalle cuadre con la fila desde la que se abre. El CTE `objetivo`, que
-- resuelve el product_id vía pedidos_wa_productos_holded / manager_compra_alias,
-- se deja intacto.
--
-- manager_cliente_productos pasa además a agrupar solo por nombre: agrupaba por
-- (nombre, product_id) y partía el mismo producto en dos filas cuando unas
-- líneas traían product_id de Holded y otras no. En TAMISA eran 33 filas para
-- 28 productos, y con el limit 30 la ficha ni siquiera las mostraba todas.

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
    from public.manager_lineas_producto_resueltas r
    join public.manager_ventas_efectivas e on e.id = r.factura_id
    cross join objetivo o
    where r.units > 0
      and (
        (o.product_id is not null and r.product_id_resuelto = o.product_id)
        or (o.product_id is null and public.manager_norm_nombre(r.nombre) = public.manager_norm_nombre(p_nombre))
      )
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

create or replace function public.manager_producto_compras_nombre(p_nombre text, p_limit integer default 60)
 returns table(fecha date, contact_id text, contact_name text, units numeric, subtotal numeric, precio_unit numeric)
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
  )
  select
    r.fecha,
    r.contact_id,
    coalesce(c.nombre, r.contact_id, '(sin proveedor)') as contact_name,
    r.unidades_producto as units,
    r.importe_coste as subtotal,
    r.precio_unitario_producto as precio_unit
  from public.manager_lineas_producto_resueltas r
  cross join objetivo o
  left join public.manager_contactos c on c.id = r.contact_id
  where r.tipo = 'COMPRA'
    and r.unidades_producto > 0
    and r.importe_coste > 0
    and (
      (o.product_id is not null and r.product_id_resuelto = o.product_id)
      or (o.product_id is null and public.manager_norm_nombre(r.nombre) = public.manager_norm_nombre(p_nombre))
    )
    and public.puede_ver_manager()
  order by r.fecha desc nulls last, r.factura_id desc, r.id
  limit p_limit;
$function$;

create or replace function public.manager_cliente_productos(p_contact_name_canon text, p_from date, p_to date, p_limit integer default 30)
 returns table(nombre text, product_id text, veces bigint, unidades numeric, ventas_subtotal numeric, cogs numeric, margen numeric, margen_pct numeric, ultima_compra date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    mode() within group (order by coalesce(nullif(trim(nombre), ''), '(sin nombre)')),
    max(product_id),
    count(*), coalesce(sum(units), 0), coalesce(sum(subtotal), 0),
    coalesce(sum(cogs_linea), 0), coalesce(sum(margen_linea), 0),
    case when sum(subtotal) > 0 then round((sum(margen_linea) / sum(subtotal)) * 100, 1) else null end,
    max(fecha)
  from public.manager_lineas_efectivas
  where coalesce(contact_name_canon, '(sin contacto)') = p_contact_name_canon
    and fecha between p_from and p_to and public.puede_ver_clientes()
  group by public.manager_norm_nombre(coalesce(nullif(trim(nombre), ''), '(sin nombre)'))
  order by sum(subtotal) desc nulls last limit p_limit;
$function$;
