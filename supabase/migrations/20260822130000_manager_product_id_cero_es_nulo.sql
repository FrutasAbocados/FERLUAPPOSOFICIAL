-- Holded usa product_id = '0' como centinela para lineas sin producto.
-- Nunca debe resolverse como un producto real ni heredar un coste agregado.

create or replace function public.manager_refresh_coste_alias()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  truncate manager_coste_alias_calc;

  insert into manager_coste_alias_calc(product_id, coste_eur, n_compras, ultima_compra)
  with lineas as (
    select l.subtotal, l.units, f.fecha, lower(trim(l.nombre)) as nom
    from manager_lineas l
    join manager_facturas f on f.id = l.factura_id
    where f.tipo = 'COMPRA'
      and l.product_id is null
      and f.fecha >= current_date - 45
      and l.subtotal > 0
      and l.units > 0
  ),
  m as (
    select
      li.fecha,
      li.subtotal,
      a.holded_product_id as pid,
      a.coste_fijo,
      li.units * a.factor_unidad as kg_eq
    from lineas li
    cross join lateral (
      select a.*
      from manager_compra_alias a
      where a.activo
        and a.holded_product_id is not null
        and a.holded_product_id <> '0'
        and (
          a.nombre_compra_norm = li.nom
          or manager_norm_nombre(a.nombre_compra_norm) = manager_norm_nombre(li.nom)
        )
      order by (a.nombre_compra_norm = li.nom) desc, a.nombre_compra_norm
      limit 1
    ) a
    where a.factor_unidad > 0
  ),
  raw as (
    select *, dense_rank() over (partition by pid order by fecha desc) as rk
    from m
  ),
  agg as (
    select
      pid,
      max(coste_fijo) as coste_fijo,
      max(fecha) as ultima_compra,
      count(distinct fecha) as n_fechas,
      sum(subtotal) filter (where rk <= 3) as s3,
      sum(kg_eq) filter (where rk <= 3) as k3,
      sum(subtotal) filter (where fecha >= current_date - 7) as s7,
      sum(kg_eq) filter (where fecha >= current_date - 7) as k7,
      sum(subtotal) filter (where fecha >= current_date - 21) as s21,
      sum(kg_eq) filter (where fecha >= current_date - 21) as k21,
      sum(subtotal) as s45,
      sum(kg_eq) as k45,
      count(*) as n
    from raw
    group by pid
  ),
  calc as (
    select
      pid,
      n,
      ultima_compra,
      coalesce(
        coste_fijo,
        case
          when n_fechas >= 3 and k3 > 0 then s3 / k3
          when k7 > 0 then s7 / k7
          when k21 > 0 then s21 / k21
          else s45 / nullif(k45, 0)
        end
      ) as coste
    from agg
  )
  select pid, coste::numeric(12,4), n, ultima_compra
  from calc
  where coste is not null and coste > 0;

  perform public.manager_refresh_coste_nombre_auto();
end;
$function$;

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
    when mc.coste_eur > 0 then 'manual_producto'
    when pc2.es_manual and pc2.coste_eur > 0 then 'manual_producto_alias'
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
left join lateral (
  select cm.coste_eur
  from public.manager_costes_manuales cm
  where cm.product_id = nullif(l.product_id, '0')
    and cm.fecha_desde <= coalesce(l.fecha, current_date)
  order by cm.fecha_desde desc
  limit 1
) mc on true
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
    case when mc.coste_eur > 0 then mc.coste_eur end,
    case when pc2.es_manual and pc2.coste_eur > 0 then pc2.coste_eur end,
    case when ap.coste_eur > 0 then ap.coste_eur end,
    case when aw.coste_eur > 0 then aw.coste_eur end,
    case when cpc.coste_eur > 0 then cpc.coste_eur end,
    case when cpw.coste_eur > 0 then cpw.coste_eur end,
    case when cnc.coste_eur > 0 then cnc.coste_eur end,
    case when pc2.coste_eur > 0 then pc2.coste_eur end
  )::numeric(12,4) as coste_unidad
) resolved;

alter view public.manager_lineas_coste_resuelto owner to postgres;
revoke select on public.manager_lineas_coste_resuelto from anon;
grant select on public.manager_lineas_coste_resuelto to authenticated;

-- Regenera la cache eliminando cualquier fila historica del centinela '0'.
select public.manager_refresh_coste_alias();
