-- Separar dos conceptos que antes estaban acoplados:
--   1. producto conocido de una compra (sirve para ficha, fecha e historico)
--   2. compra habilitada como fuente del coste calculado
--
-- Un alias inactivo conserva un producto validado, pero se excluyo a proposito
-- del motor de coste. Debe seguir apareciendo en el historial del producto.

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
    case when l.tipo = 'COMPRA' and ca.activo then ca.holded_product_id end,
    case when l.tipo = 'VENTA' then pv.holded_product_id end
  ) as product_id_resuelto,
  case
    when l.product_id is not null then 'directo'
    when l.tipo = 'COMPRA' and ca.holded_product_id is not null and ca.activo then 'alias_compra'
    when l.tipo = 'COMPRA' and ca.holded_product_id is not null then 'alias_compra_inactivo'
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
  end::numeric(14,4) as importe_coste,
  coalesce(
    l.product_id,
    case when l.tipo = 'COMPRA' then ca.holded_product_id end,
    case when l.tipo = 'VENTA' then pv.holded_product_id end
  ) as product_id_historial,
  coalesce(ca.activo, false) as alias_compra_activo
from public.manager_lineas l
left join lateral (
  select
    a.holded_product_id,
    a.factor_unidad,
    a.coste_fijo,
    a.activo
  from public.manager_compra_alias a
  where l.tipo = 'COMPRA'
    and l.product_id is null
    and a.holded_product_id is not null
    and a.factor_unidad > 0
    and (
      a.nombre_compra_norm = lower(trim(l.nombre))
      or public.manager_norm_nombre(a.nombre_compra_norm)
         = public.manager_norm_nombre(lower(trim(l.nombre)))
    )
  order by
    (a.nombre_compra_norm = lower(trim(l.nombre))) desc,
    a.activo desc,
    a.updated_at desc,
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

create table if not exists public.manager_producto_compra_resumen (
  product_id     text primary key,
  ultima_compra  date not null,
  updated_at     timestamptz not null default now()
);

alter table public.manager_producto_compra_resumen enable row level security;

drop policy if exists "manager_producto_compra_resumen: manager read"
  on public.manager_producto_compra_resumen;
create policy "manager_producto_compra_resumen: manager read"
  on public.manager_producto_compra_resumen
  for select
  using (public.puede_ver_manager());

revoke all on public.manager_producto_compra_resumen from anon;
grant select on public.manager_producto_compra_resumen to authenticated;
grant all on public.manager_producto_compra_resumen to service_role;

create or replace function public.manager_refresh_producto_compra_resumen()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  truncate public.manager_producto_compra_resumen;

  insert into public.manager_producto_compra_resumen(product_id, ultima_compra, updated_at)
  select
    r.product_id_historial,
    max(r.fecha),
    now()
  from public.manager_lineas_producto_resueltas r
  where r.tipo = 'COMPRA'
    and r.product_id_historial is not null
    and r.unidades_producto > 0
    and r.subtotal > 0
  group by r.product_id_historial;
end;
$function$;

revoke execute on function public.manager_refresh_producto_compra_resumen()
  from public, anon, authenticated;
grant execute on function public.manager_refresh_producto_compra_resumen()
  to service_role;

create or replace function public.manager_refresh_producto_compra_resumen_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.manager_refresh_producto_compra_resumen();
  return null;
end;
$function$;

revoke execute on function public.manager_refresh_producto_compra_resumen_trigger()
  from public, anon, authenticated;

drop trigger if exists manager_coste_alias_calc_refresh_compra_resumen
  on public.manager_coste_alias_calc;
create trigger manager_coste_alias_calc_refresh_compra_resumen
  after insert on public.manager_coste_alias_calc
  for each statement
  execute function public.manager_refresh_producto_compra_resumen_trigger();

-- Lista rapida: coste desde alias activos; fecha desde cualquier compra cuyo
-- producto sea conocido, aunque ese alias no participe en el coste.
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
      max(l.product_id) as product_id_original,
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
    where l.fecha between p_from and p_to
      and public.puede_ver_manager()
    group by coalesce(nullif(trim(l.nombre), ''), '(sin nombre)')
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
  left join public.manager_producto_coste pc on pc.product_id = p.pid
  left join public.manager_coste_alias_calc cac on cac.product_id = p.pid
  left join public.manager_producto_compra_resumen cr on cr.product_id = p.pid
  left join public.manager_coste_producto_calc cpc on cpc.product_id = p.pid
  left join public.manager_coste_nombre_calc cnc on cnc.nombre_norm = lower(trim(p.nombre))
  order by p.ventas_subtotal desc nulls last;
$function$;

-- Detalle e historico por id: incluir tambien compras de alias inactivos.
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
  where r.product_id_historial = p_product_id
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
    where r.product_id_historial = p_product_id
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
    where r.product_id_historial = p_product_id
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

-- Compra Operativa tambien usa el producto historico: una exclusion del motor
-- de coste no debe borrar el ultimo proveedor real.
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
        (k.holded_product_id is not null and r.product_id_historial = k.holded_product_id)
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

select public.manager_refresh_producto_compra_resumen();
