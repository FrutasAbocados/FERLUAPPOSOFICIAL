-- Manager: overrides con fin de vigencia, nombres auto enlazados al historial
-- fechado y COGS con signo correcto en abonos.
--
-- 1. manager_costes_manuales gana fecha_hasta. La fila vigente sigue siendo la
--    de fecha_desde mas reciente; si esta caducada, deja paso a las compras
--    reales en lugar de reactivar un override anterior.
-- 2. manager_refresh_coste_nombre_auto copiaba cada hora el coste vivo de
--    alias a manager_costes_manuales_nombre: overrides sin fecha, de prioridad
--    maxima y retroactivos. Deja de escribir; la vista resuelve esos nombres
--    contra el producto enlazado y su historial fechado. Las filas ya copiadas
--    se conservan hasta el 31-08 para no alterar periodos cerrados.
-- 3. Una linea con importe negativo y unidades positivas (abono por precio)
--    revierte COGS igual que una devolucion con unidades negativas.

alter table public.manager_costes_manuales
  add column if not exists fecha_hasta date;

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
  cogs.importe as cogs_linea,
  (coalesce(l.subtotal, 0) - cogs.importe)::numeric(14,4) as margen_linea
from public.manager_lineas l
left join public.manager_costes_manuales_nombre mcn
  on mcn.nombre_norm = lower(trim(l.nombre))
 and (mcn.fecha_hasta is null or l.fecha <= mcn.fecha_hasta)
left join lateral (
  select case
    when cm.fecha_hasta is null or coalesce(l.fecha, current_date) <= cm.fecha_hasta
      then cm.coste_eur
  end as coste_eur
  from public.manager_costes_manuales cm
  where cm.product_id = nullif(l.product_id, '0')
    and cm.fecha_desde <= coalesce(l.fecha, current_date)
  order by cm.fecha_desde desc
  limit 1
) mcd on true
left join lateral (
  select m.holded_product_id
  from (
    select
      pwph.holded_product_id,
      case when lower(trim(l.nombre)) = lower(pwph.holded_product_name) then 0 else 1 end as prioridad,
      pwph.updated_at,
      pwph.producto_normalizado as clave
    from public.pedidos_wa_productos_holded pwph
    where nullif(l.product_id, '0') is null
      and pwph.holded_product_id <> '0'
      and (
        lower(trim(l.nombre)) = lower(pwph.holded_product_name)
        or lower(trim(l.nombre)) = pwph.producto_normalizado
      )
    union all
    select na.holded_product_id, 2, na.updated_at, na.nombre_norm
    from public.manager_coste_nombre_auto na
    where nullif(l.product_id, '0') is null
      and na.holded_product_id <> '0'
      and na.nombre_norm = lower(trim(l.nombre))
  ) m
  order by m.prioridad, m.updated_at desc, m.clave
  limit 1
) pwph_match on true
left join lateral (
  select case
    when cm.fecha_hasta is null or coalesce(l.fecha, current_date) <= cm.fecha_hasta
      then cm.coste_eur
  end as coste_eur
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
) resolved
cross join lateral (
  select (case
    when resolved.coste_unidad is null then coalesce(l.subtotal, 0)
    when coalesce(l.subtotal, 0) < 0 then -abs(coalesce(l.units, 0)) * resolved.coste_unidad
    else coalesce(l.units, 0) * resolved.coste_unidad
  end)::numeric(14,4) as importe
) cogs;

alter view public.manager_lineas_coste_resuelto owner to postgres;
revoke select on public.manager_lineas_coste_resuelto from anon;
grant select on public.manager_lineas_coste_resuelto to authenticated;

-- La ficha de producto solo marca como manual un override vigente.
create or replace view public.manager_producto_coste
with (security_invoker = on)
as
with ult4_directas as (
  select
    l.product_id,
    l.fecha,
    l.units,
    l.subtotal,
    (l.subtotal / nullif(l.units, 0))::numeric(12,4) as coste_unit,
    row_number() over (partition by l.product_id order by l.fecha desc, l.factura_id desc, l.id desc) as rn
  from public.manager_lineas l
  where l.tipo = 'COMPRA'
    and l.product_id is not null
    and l.units > 0
    and l.subtotal > 0
), legacy_directo as (
  select
    product_id,
    case
      when count(*) = 1 then max(coste_unit)
      else sum(subtotal) / nullif(sum(units), 0)
    end as coste_calc,
    max(fecha) as ultima_compra,
    count(*) as compras_consideradas
  from ult4_directas
  where rn <= 4
  group by product_id
), latest_manual as (
  select u.product_id, u.coste_eur
  from (
    select distinct on (m.product_id) m.product_id, m.coste_eur, m.fecha_hasta
    from public.manager_costes_manuales m
    order by m.product_id, m.fecha_desde desc
  ) u
  where u.fecha_hasta is null or u.fecha_hasta >= current_date
), productos as (
  select product_id from latest_manual
  union
  select product_id from public.manager_coste_alias_calc
  union
  select product_id from public.manager_coste_producto_calc
  union
  select product_id from public.manager_producto_compra_resumen
  union
  select product_id from legacy_directo
)
select
  p.product_id,
  coalesce(m.coste_eur, a.coste_eur, c.coste_eur, d.coste_calc)::numeric(12,4) as coste_eur,
  m.product_id is not null as es_manual,
  coalesce(a.coste_eur, c.coste_eur, d.coste_calc)::numeric(12,4) as coste_calculado,
  coalesce(r.ultima_compra, a.ultima_compra, d.ultima_compra) as ultima_compra,
  coalesce(a.n_compras::bigint, d.compras_consideradas, 0::bigint) as compras_consideradas
from productos p
left join latest_manual m using (product_id)
left join public.manager_coste_alias_calc a using (product_id)
left join public.manager_coste_producto_calc c using (product_id)
left join public.manager_producto_compra_resumen r using (product_id)
left join legacy_directo d using (product_id);

create or replace function public.manager_refresh_coste_nombre_auto()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Sin efecto: manager_lineas_coste_resuelto enlaza estos nombres con su
  -- producto y usa el historial fechado. Se conserva porque el refresco de
  -- alias la invoca.
  return;
end;
$function$;

revoke all on function public.manager_refresh_coste_nombre_auto() from public, anon, authenticated;
grant execute on function public.manager_refresh_coste_nombre_auto() to service_role;

update public.manager_costes_manuales_nombre
set fecha_hasta = date '2026-08-31'
where nota like 'auto desde compra %'
  and fecha_hasta is null;
