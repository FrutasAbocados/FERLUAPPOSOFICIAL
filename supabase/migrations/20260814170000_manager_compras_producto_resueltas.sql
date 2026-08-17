-- Manager: resolver las compras recientes que Holded entrega sin product_id.
--
-- Desde mayo las lineas de compra sincronizadas llegan con product_id NULL. Los
-- alias de manager_compra_alias ya calculan el coste vivo correctamente, pero
-- las fichas de producto, los historicos y las alertas seguian filtrando por el
-- product_id crudo. Esta vista concentra la resolucion para que todos consuman
-- la misma linea, unidad y coste efectivo.

create or replace view public.manager_lineas_producto_resueltas
with (security_invoker = on)
as
select
  l.id,
  l.factura_id,
  l.tipo,
  l.subtipo,
  l.fecha,
  l.contact_id,
  l.product_id as product_id_original,
  coalesce(
    l.product_id,
    case when l.tipo = 'COMPRA' then ca.holded_product_id end,
    case when l.tipo = 'VENTA' then pv.holded_product_id end
  ) as product_id_resuelto,
  case
    when l.product_id is not null then 'directo'
    when l.tipo = 'COMPRA' and ca.holded_product_id is not null then 'alias_compra'
    when l.tipo = 'VENTA' and pv.holded_product_id is not null then 'producto_holded'
    else 'sin_mapear'
  end as fuente_resolucion,
  l.nombre,
  l.units,
  l.subtotal,
  case
    when l.tipo = 'COMPRA' and l.product_id is null and ca.holded_product_id is not null
      then ca.factor_unidad
    else 1::numeric
  end::numeric as factor_unidad,
  (
    l.units * case
      when l.tipo = 'COMPRA' and l.product_id is null and ca.holded_product_id is not null
        then ca.factor_unidad
      else 1::numeric
    end
  )::numeric as unidades_producto,
  ca.coste_fijo,
  case
    when l.tipo = 'COMPRA' then coalesce(
      ca.coste_fijo,
      l.subtotal / nullif(
        l.units * case
          when l.product_id is null and ca.holded_product_id is not null then ca.factor_unidad
          else 1::numeric
        end,
        0
      )
    )
    else l.subtotal / nullif(l.units, 0)
  end::numeric(14,4) as precio_unitario_producto,
  case
    when l.tipo = 'COMPRA' and ca.coste_fijo is not null
      then ca.coste_fijo * l.units * ca.factor_unidad
    else l.subtotal
  end::numeric(14,4) as importe_coste
from public.manager_lineas l
left join lateral (
  select
    a.holded_product_id,
    a.factor_unidad,
    a.coste_fijo
  from public.manager_compra_alias a
  where l.tipo = 'COMPRA'
    and l.product_id is null
    and a.activo
    and a.holded_product_id is not null
    and a.factor_unidad > 0
    and (
      a.nombre_compra_norm = lower(trim(l.nombre))
      or public.manager_norm_nombre(a.nombre_compra_norm)
         = public.manager_norm_nombre(lower(trim(l.nombre)))
    )
  order by
    (a.nombre_compra_norm = lower(trim(l.nombre))) desc,
    a.nombre_compra_norm
  limit 1
) ca on true
left join lateral (
  select p.holded_product_id
  from public.pedidos_wa_productos_holded p
  where l.tipo = 'VENTA'
    and l.product_id is null
    and p.holded_product_id <> '0'
    and (
      lower(trim(l.nombre)) = lower(trim(p.holded_product_name))
      or lower(trim(l.nombre)) = p.producto_normalizado
    )
  order by
    case when p.source = 'manual' then 0 else 1 end,
    p.updated_at desc
  limit 1
) pv on true;

revoke select on public.manager_lineas_producto_resueltas from anon;
grant select on public.manager_lineas_producto_resueltas to authenticated, service_role;

-- Lista de productos: el margen sigue viniendo de manager_lineas_efectivas,
-- pero el id, coste actual y ultima compra usan la resolucion viva.
create or replace function public.manager_productos_lista(p_from date, p_to date)
returns table(
  product_id      text,
  nombre          text,
  veces           bigint,
  unidades        numeric,
  ventas          numeric,
  ventas_subtotal numeric,
  cogs            numeric,
  margen          numeric,
  margen_pct      numeric,
  coste_unidad    numeric,
  es_coste_manual boolean,
  ultima_compra   date,
  ultima_venta    date
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with agg as (
    select
      max(r.product_id_resuelto) as pid,
      coalesce(nullif(trim(l.nombre), ''), '(sin nombre)') as nombre,
      count(*) as veces,
      coalesce(sum(l.units), 0) as unidades,
      coalesce(sum(l.total_linea), 0) as ventas,
      coalesce(sum(l.subtotal), 0) as ventas_subtotal,
      coalesce(sum(l.cogs_linea), 0) as cogs,
      coalesce(sum(l.margen_linea), 0) as margen,
      case when sum(l.subtotal) > 0
        then round((sum(l.margen_linea) / sum(l.subtotal)) * 100, 1)
        else null
      end as margen_pct,
      max(l.coste_unidad) as max_coste_linea,
      max(l.fecha) as ultima_venta
    from public.manager_lineas_efectivas l
    join public.manager_lineas_producto_resueltas r
      on r.factura_id = l.factura_id and r.id = l.id
    where l.fecha between p_from and p_to
      and public.puede_ver_manager()
    group by coalesce(nullif(trim(l.nombre), ''), '(sin nombre)')
  ),
  compras_actual as (
    select
      r.product_id_resuelto as product_id,
      max(r.fecha) as ultima_compra
    from public.manager_lineas_producto_resueltas r
    where r.tipo = 'COMPRA'
      and r.product_id_resuelto is not null
      and r.unidades_producto > 0
      and r.importe_coste > 0
    group by r.product_id_resuelto
  )
  select
    agg.pid,
    agg.nombre,
    agg.veces,
    agg.unidades,
    agg.ventas,
    agg.ventas_subtotal,
    agg.cogs,
    agg.margen,
    agg.margen_pct,
    coalesce(
      mcn.coste_eur,
      case when pc.es_manual then pc.coste_eur end,
      cac.coste_eur,
      cpc.coste_eur,
      cnc.coste_eur,
      pc.coste_eur,
      agg.max_coste_linea
    )::numeric as coste_unidad,
    (mcn.nombre_norm is not null or coalesce(pc.es_manual, false)) as es_coste_manual,
    ca.ultima_compra,
    agg.ultima_venta
  from agg
  left join public.manager_costes_manuales_nombre mcn
    on mcn.nombre_norm = lower(trim(agg.nombre))
  left join public.manager_producto_coste pc on pc.product_id = agg.pid
  left join public.manager_coste_alias_calc cac on cac.product_id = agg.pid
  left join public.manager_coste_producto_calc cpc on cpc.product_id = agg.pid
  left join public.manager_coste_nombre_calc cnc on cnc.nombre_norm = lower(trim(agg.nombre))
  left join compras_actual ca on ca.product_id = agg.pid
  order by agg.ventas_subtotal desc nulls last;
$function$;

-- Ficha: compras reales del producto, incluidas las lineas resueltas por alias.
create or replace function public.manager_producto_compras(
  p_product_id text,
  p_limit integer default 60
)
returns table(
  fecha        date,
  contact_id   text,
  contact_name text,
  units        numeric,
  subtotal     numeric,
  precio_unit  numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    r.fecha,
    r.contact_id,
    coalesce(c.nombre, r.contact_id, '(sin proveedor)') as contact_name,
    r.unidades_producto as units,
    r.importe_coste as subtotal,
    r.precio_unitario_producto as precio_unit
  from public.manager_lineas_producto_resueltas r
  left join public.manager_contactos c on c.id = r.contact_id
  where r.product_id_resuelto = p_product_id
    and r.tipo = 'COMPRA'
    and r.unidades_producto > 0
    and r.importe_coste > 0
    and public.puede_ver_manager()
  order by r.fecha desc nulls last, r.factura_id desc, r.id
  limit p_limit;
$function$;

create or replace function public.manager_producto_historico(
  p_product_id text,
  p_meses integer default 12
)
returns table(
  mes                  date,
  unidades_vendidas    numeric,
  ventas               numeric,
  precio_venta_medio   numeric,
  unidades_compradas   numeric,
  compras              numeric,
  precio_compra_medio  numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with meses as (
    select generate_series(
      date_trunc('month', current_date) - ((p_meses - 1) || ' month')::interval,
      date_trunc('month', current_date),
      '1 month'::interval
    )::date as mes
  ),
  ventas_m as (
    select
      date_trunc('month', r.fecha)::date as mes,
      sum(r.units) as units,
      sum(r.subtotal) as importe
    from public.manager_lineas_producto_resueltas r
    join public.manager_ventas_efectivas e on e.id = r.factura_id
    where r.product_id_resuelto = p_product_id
      and r.units > 0
      and public.puede_ver_manager()
    group by 1
  ),
  compras_m as (
    select
      date_trunc('month', r.fecha)::date as mes,
      sum(r.unidades_producto) as units,
      sum(r.importe_coste) as importe
    from public.manager_lineas_producto_resueltas r
    where r.product_id_resuelto = p_product_id
      and r.tipo = 'COMPRA'
      and r.unidades_producto > 0
      and r.importe_coste > 0
      and public.puede_ver_manager()
    group by 1
  )
  select
    m.mes,
    coalesce(v.units, 0),
    coalesce(v.importe, 0),
    case when coalesce(v.units, 0) > 0
      then (v.importe / v.units)::numeric(12,4)
      else null
    end,
    coalesce(c.units, 0),
    coalesce(c.importe, 0),
    case when coalesce(c.units, 0) > 0
      then (c.importe / c.units)::numeric(12,4)
      else null
    end
  from meses m
  left join ventas_m v on v.mes = m.mes
  left join compras_m c on c.mes = m.mes
  order by m.mes;
$function$;

-- Los productos vendidos por nombre intentan primero resolver su id Holded. Si
-- aun no existe mapeo, conservan el fallback exacto por nombre.
create or replace function public.manager_producto_compras_nombre(
  p_nombre text,
  p_limit integer default 60
)
returns table(
  fecha        date,
  contact_id   text,
  contact_name text,
  units        numeric,
  subtotal     numeric,
  precio_unit  numeric
)
language sql
stable
security definer
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
      or (o.product_id is null and lower(trim(r.nombre)) = lower(trim(p_nombre)))
    )
    and public.puede_ver_manager()
  order by r.fecha desc nulls last, r.factura_id desc, r.id
  limit p_limit;
$function$;

create or replace function public.manager_producto_historico_nombre(
  p_nombre text,
  p_meses integer default 12
)
returns table(
  mes                  date,
  unidades_vendidas    numeric,
  ventas               numeric,
  precio_venta_medio   numeric,
  unidades_compradas   numeric,
  compras              numeric,
  precio_compra_medio  numeric
)
language sql
stable
security definer
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
    select
      date_trunc('month', r.fecha)::date as mes,
      sum(r.units) as units,
      sum(r.subtotal) as importe
    from public.manager_lineas_producto_resueltas r
    join public.manager_ventas_efectivas e on e.id = r.factura_id
    cross join objetivo o
    where r.units > 0
      and (
        (o.product_id is not null and r.product_id_resuelto = o.product_id)
        or (o.product_id is null and lower(trim(r.nombre)) = lower(trim(p_nombre)))
      )
      and public.puede_ver_manager()
    group by 1
  ),
  compras_m as (
    select
      date_trunc('month', r.fecha)::date as mes,
      sum(r.unidades_producto) as units,
      sum(r.importe_coste) as importe
    from public.manager_lineas_producto_resueltas r
    cross join objetivo o
    where r.tipo = 'COMPRA'
      and r.unidades_producto > 0
      and r.importe_coste > 0
      and (
        (o.product_id is not null and r.product_id_resuelto = o.product_id)
        or (o.product_id is null and lower(trim(r.nombre)) = lower(trim(p_nombre)))
      )
      and public.puede_ver_manager()
    group by 1
  )
  select
    m.mes,
    coalesce(v.units, 0),
    coalesce(v.importe, 0),
    case when coalesce(v.units, 0) > 0
      then (v.importe / v.units)::numeric(12,4)
      else null
    end,
    coalesce(c.units, 0),
    coalesce(c.importe, 0),
    case when coalesce(c.units, 0) > 0
      then (c.importe / c.units)::numeric(12,4)
      else null
    end
  from meses m
  left join ventas_m v on v.mes = m.mes
  left join compras_m c on c.mes = m.mes
  order by m.mes;
$function$;

-- Refresco horario de los fallbacks: ya no queda congelado en las compras que
-- aun conservaban product_id antes de mayo.
create or replace function public.manager_refresh_costes_calc()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  truncate public.manager_coste_producto_calc;

  insert into public.manager_coste_producto_calc (product_id, coste_eur)
  with reciente as (
    select
      r.product_id_resuelto as product_id,
      percentile_cont(0.5) within group (order by r.precio_unitario_producto)::numeric(12,4) as coste
    from public.manager_lineas_producto_resueltas r
    where r.tipo = 'COMPRA'
      and r.product_id_resuelto is not null
      and r.precio_unitario_producto > 0
      and r.fecha >= current_date - 120
    group by r.product_id_resuelto
  ),
  historico as (
    select
      r.product_id_resuelto as product_id,
      percentile_cont(0.5) within group (order by r.precio_unitario_producto)::numeric(12,4) as coste
    from public.manager_lineas_producto_resueltas r
    where r.tipo = 'COMPRA'
      and r.product_id_resuelto is not null
      and r.precio_unitario_producto > 0
    group by r.product_id_resuelto
  )
  select h.product_id, coalesce(r.coste, h.coste)::numeric(12,4)
  from historico h
  left join reciente r using (product_id);

  truncate public.manager_coste_nombre_calc;

  insert into public.manager_coste_nombre_calc (nombre_norm, coste_eur)
  with reciente as (
    select
      lower(trim(r.nombre)) as nombre_norm,
      percentile_cont(0.5) within group (order by r.precio_unitario_producto)::numeric(12,4) as coste
    from public.manager_lineas_producto_resueltas r
    where r.tipo = 'COMPRA'
      and r.precio_unitario_producto > 0
      and r.fecha >= current_date - 120
    group by lower(trim(r.nombre))
  ),
  historico as (
    select
      lower(trim(r.nombre)) as nombre_norm,
      percentile_cont(0.5) within group (order by r.precio_unitario_producto)::numeric(12,4) as coste
    from public.manager_lineas_producto_resueltas r
    where r.tipo = 'COMPRA'
      and r.precio_unitario_producto > 0
    group by lower(trim(r.nombre))
  )
  select h.nombre_norm, coalesce(r.coste, h.coste)::numeric(12,4)
  from historico h
  left join reciente r using (nombre_norm)
  where h.nombre_norm is not null and h.nombre_norm <> '';
end;
$function$;

-- Alertas de subida de coste y PVP sugerido sobre compras resueltas.
create or replace function public.dashboard_costes_subiendo(
  p_dias integer default 14,
  p_pct_min numeric default 15
)
returns table(
  product_id    text,
  nombre        text,
  coste_actual  numeric,
  coste_anterior numeric,
  variacion_pct numeric,
  ultima_compra date
)
language sql
stable
set search_path to 'public'
as $function$
  with compras as (
    select
      r.product_id_resuelto as product_id,
      coalesce(p.nombre, r.nombre) as nombre,
      r.fecha,
      r.unidades_producto as units,
      r.importe_coste as subtotal
    from public.manager_lineas_producto_resueltas r
    left join lateral (
      select ph.holded_product_name as nombre
      from public.pedidos_wa_productos_holded ph
      where ph.holded_product_id = r.product_id_resuelto
      order by case when ph.source = 'manual' then 0 else 1 end, ph.updated_at desc
      limit 1
    ) p on true
    where r.tipo = 'COMPRA'
      and r.product_id_resuelto is not null
      and r.unidades_producto > 0
      and r.importe_coste > 0
  ),
  reciente as (
    select
      product_id,
      max(nombre) as nombre,
      sum(subtotal) / nullif(sum(units), 0) as coste,
      max(fecha) as ult
    from compras
    where fecha >= current_date - p_dias
    group by product_id
  ),
  anterior as (
    select
      product_id,
      sum(subtotal) / nullif(sum(units), 0) as coste
    from compras
    where fecha >= current_date - 90
      and fecha < current_date - p_dias
    group by product_id
    having count(*) >= 2
  )
  select
    r.product_id,
    r.nombre,
    r.coste::numeric(12,4),
    a.coste::numeric(12,4),
    round(((r.coste - a.coste) / a.coste) * 100, 1),
    r.ult
  from reciente r
  join anterior a using (product_id)
  where a.coste > 0
    and ((r.coste - a.coste) / a.coste) * 100 >= p_pct_min
  order by ((r.coste - a.coste) / a.coste) * 100 desc
  limit 20;
$function$;

create or replace function public.dashboard_pvp_sugerido(
  p_dias integer default 14,
  p_pct_min numeric default 15,
  p_margen_objetivo_pct numeric default 25
)
returns table(
  product_id          text,
  nombre              text,
  coste_actual        numeric,
  coste_anterior      numeric,
  coste_variacion_pct numeric,
  pvp_actual          numeric,
  pvp_sugerido        numeric,
  margen_actual_pct   numeric,
  delta_pvp_pct       numeric,
  ultimas_ventas_dias integer,
  ultima_compra       date
)
language sql
stable
set search_path to 'public'
as $function$
  with compras as (
    select
      r.product_id_resuelto as product_id,
      coalesce(p.nombre, r.nombre) as nombre,
      r.fecha,
      r.unidades_producto as units,
      r.importe_coste as subtotal
    from public.manager_lineas_producto_resueltas r
    left join lateral (
      select ph.holded_product_name as nombre
      from public.pedidos_wa_productos_holded ph
      where ph.holded_product_id = r.product_id_resuelto
      order by case when ph.source = 'manual' then 0 else 1 end, ph.updated_at desc
      limit 1
    ) p on true
    where r.tipo = 'COMPRA'
      and r.product_id_resuelto is not null
      and r.unidades_producto > 0
      and r.importe_coste > 0
  ),
  coste_recien as (
    select
      product_id,
      max(nombre) as nombre,
      sum(subtotal) / nullif(sum(units), 0) as coste,
      max(fecha) as ult
    from compras
    where fecha >= current_date - p_dias
    group by product_id
  ),
  coste_antes as (
    select
      product_id,
      sum(subtotal) / nullif(sum(units), 0) as coste
    from compras
    where fecha >= current_date - 90
      and fecha < current_date - p_dias
    group by product_id
    having count(*) >= 2
  ),
  pvp_recien as (
    select
      r.product_id_resuelto as product_id,
      sum(r.subtotal) / nullif(sum(r.units), 0) as pvp,
      count(distinct r.fecha)::integer as dias_con_venta
    from public.manager_lineas_producto_resueltas r
    join public.manager_ventas_efectivas e on e.id = r.factura_id
    where r.product_id_resuelto is not null
      and r.units > 0
      and r.subtotal > 0
      and r.fecha >= current_date - 30
    group by r.product_id_resuelto
  )
  select
    r.product_id,
    r.nombre,
    r.coste::numeric(12,4),
    a.coste::numeric(12,4),
    round(((r.coste - a.coste) / a.coste) * 100, 1),
    p.pvp::numeric(12,4),
    round((r.coste / (1 - (p_margen_objetivo_pct / 100)))::numeric, 2),
    case when p.pvp > 0
      then round(((p.pvp - r.coste) / p.pvp) * 100, 1)
      else null
    end,
    case when p.pvp > 0
      then round((((r.coste / (1 - (p_margen_objetivo_pct / 100))) - p.pvp) / p.pvp) * 100, 1)
      else null
    end,
    coalesce(p.dias_con_venta, 0),
    r.ult
  from coste_recien r
  join coste_antes a using (product_id)
  left join pvp_recien p using (product_id)
  where a.coste > 0
    and ((r.coste - a.coste) / a.coste) * 100 >= p_pct_min
  order by ((r.coste - a.coste) / a.coste) * 100 desc
  limit 30;
$function$;

-- Compra Operativa: el proveedor historico tambien debe seguir el producto
-- resuelto. SECURITY DEFINER permite consultar el alias sin exponer la tabla a
-- empleados; el helper mantiene la misma frontera funcional de Pedidos WA.
create or replace function public.pedidos_wa_compra_operativa(p_fecha date)
returns table(
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
  proveedor_fuente text,
  unidad_compra text,
  contenido_compra numeric,
  cantidad_compra numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with acceso as (
    select 1
    where public.puede_operar_pedidos_wa() or public.puede_ver_manager()
  ),
  cotejo as (
    select c.*
    from acceso
    cross join lateral public.pedidos_wa_cotejo(p_fecha) c
  ),
  keys as (
    select
      c.*,
      lower(c.producto) as producto_key,
      ph.holded_product_id
    from cotejo c
    left join lateral (
      select p.holded_product_id
      from public.pedidos_wa_productos_holded p
      where p.holded_product_name = c.producto
      order by case when p.source = 'manual' then 0 else 1 end, p.updated_at desc
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
    join public.manager_lineas_producto_resueltas r
      on r.tipo = 'COMPRA'
      and (
        (k.holded_product_id is not null and r.product_id_resuelto = k.holded_product_id)
        or (
          k.holded_product_id is null
          and lower(trim(r.nombre)) = lower(trim(k.producto))
        )
      )
    join public.manager_facturas mf on mf.id = r.factura_id and mf.tipo = 'COMPRA'
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
    case
      when pp.proveedor is not null then 'manual'
      when h.proveedor is not null then 'historico'
      else 'default'
    end as proveedor_fuente,
    coalesce(fc.unidad_compra, k.unidad) as unidad_compra,
    coalesce(fc.contenido, 1) as contenido_compra,
    case when fc.contenido is not null
      then ceil(k.a_comprar / fc.contenido)
      else k.a_comprar
    end as cantidad_compra
  from keys k
  left join public.pedidos_wa_producto_proveedor pp on pp.producto_key = k.producto_key
  left join historico h on h.producto_key = k.producto_key
  left join public.pedidos_wa_formatos_compra fc
    on fc.producto_key = k.producto_key and fc.unidad_base = k.unidad
  order by coalesce(pp.proveedor, h.proveedor, 'alcalde'), k.a_comprar desc, k.producto;
$function$;

revoke execute on function public.pedidos_wa_compra_operativa(date) from public, anon;
grant execute on function public.pedidos_wa_compra_operativa(date) to authenticated, service_role;

-- Refrescar los fallbacks inmediatamente; los crons horarios continuan en :10
-- (calc) y :15 (alias).
select public.manager_refresh_costes_calc();
