-- Manager: coste historico por fecha para que un periodo cerrado no cambie
-- cuando cambia el coste vivo de las ultimas compras.
--
-- La cache guarda, para cada producto y fecha de compra, la media ponderada de
-- las tres ultimas fechas disponibles. Cada venta toma la fila mas reciente
-- cuya fecha sea <= a la fecha de venta. Los overrides manuales con fecha
-- conservan prioridad.

create table if not exists public.manager_coste_producto_historial (
  product_id text not null,
  fecha date not null,
  coste_eur numeric(12,4) not null check (coste_eur > 0),
  compras_consideradas bigint not null default 0,
  primary key (product_id, fecha)
);

alter table public.manager_coste_producto_historial enable row level security;

drop policy if exists "manager_coste_producto_historial: manager read"
  on public.manager_coste_producto_historial;
create policy "manager_coste_producto_historial: manager read"
  on public.manager_coste_producto_historial
  for select to authenticated
  using (public.puede_ver_manager());

revoke all on public.manager_coste_producto_historial from public, anon;
grant select on public.manager_coste_producto_historial to authenticated, service_role;

create or replace function public.manager_refresh_coste_historico()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  truncate public.manager_coste_producto_historial;

  insert into public.manager_coste_producto_historial
    (product_id, fecha, coste_eur, compras_consideradas)
  with compras_dia as (
    select
      r.product_id_resuelto as product_id,
      r.fecha,
      sum(r.importe_coste) as importe,
      sum(r.unidades_producto) as unidades,
      count(*) as lineas
    from public.manager_lineas_producto_resueltas r
    where r.tipo = 'COMPRA'
      and r.product_id_resuelto is not null
      and r.product_id_resuelto <> '0'
      and r.fecha is not null
      and r.importe_coste > 0
      and r.unidades_producto > 0
    group by r.product_id_resuelto, r.fecha
  ), acumulado as (
    select
      product_id,
      fecha,
      sum(importe) over ventana as importe_3_fechas,
      sum(unidades) over ventana as unidades_3_fechas,
      sum(lineas) over ventana as lineas_3_fechas
    from compras_dia
    window ventana as (
      partition by product_id
      order by fecha
      rows between 2 preceding and current row
    )
  )
  select
    product_id,
    fecha,
    (importe_3_fechas / nullif(unidades_3_fechas, 0))::numeric(12,4),
    lineas_3_fechas
  from acumulado
  where importe_3_fechas > 0 and unidades_3_fechas > 0;
end;
$function$;

revoke all on function public.manager_refresh_coste_historico()
  from public, anon, authenticated;
grant execute on function public.manager_refresh_coste_historico() to service_role;

-- El refresco horario existente mantiene tambien la cache historica.
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

  perform public.manager_refresh_coste_historico();
end;
$function$;

-- Los overrides por nombre pueden caducar sin perder la nota ni el dato
-- historico. Guardar uno de nuevo lo reactiva.
alter table public.manager_costes_manuales_nombre
  add column if not exists fecha_hasta date;

update public.manager_costes_manuales_nombre
set fecha_hasta = date '2026-07-31'
where nombre_norm in (
  'lima extra kg',
  'naranja zumo  kg',
  'tomate pera extra kg'
)
and fecha_hasta is null;

create or replace function public.manager_set_coste_nombre(
  p_nombre text,
  p_coste numeric,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'no autorizado';
  end if;
  if p_coste is null or p_coste < 0 then
    raise exception 'coste invalido';
  end if;
  insert into public.manager_costes_manuales_nombre
    (nombre_norm, coste_eur, nota, updated_at, fecha_hasta)
  values (
    lower(trim(p_nombre)),
    p_coste,
    nullif(trim(coalesce(p_nota, '')), ''),
    now(),
    null
  )
  on conflict (nombre_norm) do update
    set coste_eur = excluded.coste_eur,
        nota = excluded.nota,
        updated_at = now(),
        fecha_hasta = null;
end;
$function$;

create or replace function public.manager_coste_manual_nombre_get(p_nombre text)
returns table(
  nombre_norm text,
  coste_eur numeric,
  nota text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select m.nombre_norm, m.coste_eur, m.nota, m.updated_at
  from public.manager_costes_manuales_nombre m
  where m.nombre_norm = lower(trim(p_nombre))
    and (m.fecha_hasta is null or m.fecha_hasta >= current_date)
    and public.puede_ver_manager();
$function$;

-- Vista canonica de COGS: manual fechado -> compra historica -> fallbacks vivos.
create or replace view public.manager_lineas_coste_resuelto
with (security_invoker = on)
as
select
  l.id,
  l.factura_id,
  l.tipo,
  l.subtipo,
  l.fecha,
  l.contact_id,
  l.product_id,
  l.nombre,
  l.descripcion,
  l.sku,
  l.units,
  l.price,
  l.discount,
  l.tax_rate,
  l.subtotal,
  (coalesce(l.subtotal, 0) * (1 + coalesce(l.tax_rate, 0) / 100))::numeric(14,4) as total_linea,
  resolved.coste_unidad,
  case
    when resolved.coste_unidad is null then null
    when mcn.coste_eur > 0 then 'manual_nombre'
    when mcd.coste_eur > 0 or mcm.coste_eur > 0 then 'manual_producto'
    when hist.coste_eur > 0 then 'compra_historica'
    when ap.coste_eur > 0 then 'compras_alias_producto'
    when aw.coste_eur > 0 then 'compras_alias_nombre'
    when cpc.coste_eur > 0 then 'compras_producto'
    when cpw.coste_eur > 0 then 'compras_producto_alias'
    when cnc.coste_eur > 0 then 'compras_nombre'
    else 'catalogo_alias'
  end::text as coste_fuente,
  (l.tipo = 'VENTA' and coalesce(l.subtotal, 0) <> 0 and resolved.coste_unidad is null) as coste_pendiente,
  case
    when resolved.coste_unidad is null then coalesce(l.subtotal, 0)
    else coalesce(l.units, 0) * resolved.coste_unidad
  end::numeric(14,4) as cogs_linea,
  case
    when resolved.coste_unidad is null then 0
    else coalesce(l.subtotal, 0) - coalesce(l.units, 0) * resolved.coste_unidad
  end::numeric(14,4) as margen_linea
from public.manager_lineas l
left join public.manager_costes_manuales_nombre mcn
  on mcn.nombre_norm = lower(trim(l.nombre))
 and (mcn.fecha_hasta is null or l.fecha <= mcn.fecha_hasta)
left join lateral (
  select cm.coste_eur
  from public.manager_costes_manuales cm
  where cm.product_id = nullif(l.product_id, '0')
    and cm.fecha_desde <= coalesce(l.fecha, current_date)
  order by cm.fecha_desde desc
  limit 1
) mcd on true
left join lateral (
  select pwph.holded_product_id
  from public.pedidos_wa_productos_holded pwph
  where nullif(l.product_id, '0') is null
    and pwph.holded_product_id <> '0'
    and (
      lower(trim(l.nombre)) = lower(pwph.holded_product_name)
      or lower(trim(l.nombre)) = pwph.producto_normalizado
    )
  order by
    (lower(trim(l.nombre)) = lower(pwph.holded_product_name)) desc,
    pwph.updated_at desc,
    pwph.producto_normalizado
  limit 1
) pwph_match on true
left join lateral (
  select cm.coste_eur
  from public.manager_costes_manuales cm
  where cm.product_id = pwph_match.holded_product_id
    and cm.fecha_desde <= coalesce(l.fecha, current_date)
  order by cm.fecha_desde desc
  limit 1
) mcm on true
left join lateral (
  select h.coste_eur
  from public.manager_coste_producto_historial h
  where h.product_id = coalesce(nullif(l.product_id, '0'), pwph_match.holded_product_id)
    and h.fecha <= coalesce(l.fecha, current_date)
  order by h.fecha desc
  limit 1
) hist on true
left join public.manager_coste_alias_calc ap
  on ap.product_id = nullif(l.product_id, '0')
left join public.manager_coste_alias_calc aw
  on aw.product_id = pwph_match.holded_product_id
left join public.manager_producto_coste pc2
  on pc2.product_id = pwph_match.holded_product_id
left join public.manager_coste_producto_calc cpc
  on cpc.product_id = nullif(l.product_id, '0')
left join public.manager_coste_producto_calc cpw
  on cpw.product_id = pwph_match.holded_product_id
left join public.manager_coste_nombre_calc cnc
  on cnc.nombre_norm = lower(trim(l.nombre))
cross join lateral (
  select coalesce(
    case when mcn.coste_eur > 0 then mcn.coste_eur end,
    case when mcd.coste_eur > 0 then mcd.coste_eur end,
    case when mcm.coste_eur > 0 then mcm.coste_eur end,
    case when hist.coste_eur > 0 then hist.coste_eur end,
    case when ap.coste_eur > 0 then ap.coste_eur end,
    case when aw.coste_eur > 0 then aw.coste_eur end,
    case when cpc.coste_eur > 0 then cpc.coste_eur end,
    case when cpw.coste_eur > 0 then cpw.coste_eur end,
    case when cnc.coste_eur > 0 then cnc.coste_eur end,
    case when not coalesce(pc2.es_manual, false) and pc2.coste_eur > 0 then pc2.coste_eur end
  )::numeric(12,4) as coste_unidad
) resolved;

alter view public.manager_lineas_coste_resuelto owner to postgres;
revoke select on public.manager_lineas_coste_resuelto from anon;
grant select on public.manager_lineas_coste_resuelto to authenticated;

-- El nombre de las tarjetas dice "por margen": ordenar por margen, no ventas.
create or replace function public.manager_top_productos_margen(
  p_from date,
  p_to date,
  p_limit integer default 10
)
returns table(
  nombre text,
  product_id text,
  unidades numeric,
  ventas numeric,
  ventas_subtotal numeric,
  cogs numeric,
  margen numeric,
  margen_pct numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    coalesce(nullif(trim(nombre), ''), '(sin nombre)') as nombre,
    max(product_id) as product_id,
    coalesce(sum(units), 0) as unidades,
    coalesce(sum(total_linea), 0) as ventas,
    coalesce(sum(subtotal), 0) as ventas_subtotal,
    coalesce(sum(cogs_linea), 0) as cogs,
    coalesce(sum(margen_linea), 0) as margen,
    case when sum(subtotal) > 0
      then round((sum(margen_linea) / sum(subtotal)) * 100, 1)
      else null
    end as margen_pct
  from public.manager_lineas_efectivas
  where fecha between p_from and p_to
    and public.puede_ver_manager()
  group by coalesce(nullif(trim(nombre), ''), '(sin nombre)')
  order by margen desc nulls last
  limit p_limit;
$function$;

create or replace function public.manager_top_clientes_margen(
  p_from date,
  p_to date,
  p_limit integer default 10
)
returns table(
  contact_name_canon text,
  docs bigint,
  unidades numeric,
  ventas numeric,
  ventas_subtotal numeric,
  cogs numeric,
  margen numeric,
  margen_pct numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cab as (
    select
      coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
      count(distinct id) as docs,
      coalesce(sum(total), 0) as ventas_total
    from public.manager_ventas_efectivas_canon
    where fecha between p_from and p_to
      and public.puede_ver_manager()
    group by 1
  ), lin as (
    select
      coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
      coalesce(sum(units), 0) as unidades,
      coalesce(sum(subtotal), 0) as ventas_subtotal,
      coalesce(sum(cogs_linea), 0) as cogs,
      coalesce(sum(margen_linea), 0) as margen
    from public.manager_lineas_efectivas
    where fecha between p_from and p_to
    group by 1
  )
  select
    cab.contact_name_canon,
    cab.docs,
    coalesce(lin.unidades, 0),
    cab.ventas_total,
    coalesce(lin.ventas_subtotal, 0),
    coalesce(lin.cogs, 0),
    coalesce(lin.margen, 0),
    case when coalesce(lin.ventas_subtotal, 0) > 0
      then round((lin.margen / lin.ventas_subtotal) * 100, 1)
      else null
    end
  from cab
  left join lin using (contact_name_canon)
  order by coalesce(lin.margen, 0) desc nulls last
  limit p_limit;
$function$;

select public.manager_refresh_coste_historico();
