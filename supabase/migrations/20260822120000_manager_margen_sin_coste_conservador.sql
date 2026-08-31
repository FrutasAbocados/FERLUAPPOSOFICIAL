-- Manager: ningún coste desconocido puede convertirse en margen del 100%.
--
-- Hasta ahora los tres motores de margen hacían COALESCE(coste, 0). Cuando una
-- línea manual/OCR no tenía product_id ni alias, el COGS era 0 y todo el
-- subtotal aparecía como beneficio. Esta migración centraliza la resolución y
-- aplica una política conservadora: coste desconocido => COGS = subtotal,
-- margen provisional = 0. El coste unitario sigue NULL para que la UI pueda
-- señalar que falta resolverlo.

-- Variantes inequívocas observadas en ventas recientes. Se enlazan al catálogo
-- vivo; no se fija un importe, por lo que el coste seguirá las compras reales.
insert into public.pedidos_wa_productos_holded
  (producto_normalizado, holded_product_id, holded_product_name, source)
values
  ('docena huevos m',          '69820f73babf54480409b7b9', 'HUEVOS M DOCENA',          'manual'),
  ('huevos docena',            '69820f73babf54480409b7b9', 'HUEVOS M DOCENA',          'manual'),
  ('huevo docena',             '69820f73babf54480409b7b9', 'HUEVOS M DOCENA',          'manual'),
  ('champiñon entero kg',      '66910a3e4bc05c1ce90cd4d7', 'CHAMPIÑÓN ENTERO KG',      'manual'),
  ('champiñon kg',             '66910a3e4bc05c1ce90cd4d7', 'CHAMPIÑÓN ENTERO KG',      'manual'),
  ('limon kg',                 '6695200bdc3b9c9d9b09719e', 'LIMÓN VERNA KG',           'manual'),
  ('naranja zumo kg',          '6691150b38fe57f167061768', 'NARANJA ZUMO  KG',         'manual'),
  ('patata nueva velez kg',    '6699012943849f3231062b0a', 'PATATA NUEVA KG',          'manual'),
  ('esparrago gordo',          '69c0ee8b9154ad9ebb0ef7d6', 'ESPARRAGOS XL',             'manual'),
  ('cebolla gorda kg',         '6691073163595e73e00989b6', 'CEBOLLA BLANCA KG',        'manual'),
  ('cebolla kg',               '6691073163595e73e00989b6', 'CEBOLLA BLANCA KG',        'manual')
on conflict (producto_normalizado) do nothing;

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
  where cm.product_id = l.product_id
    and cm.fecha_desde <= coalesce(l.fecha, current_date)
  order by cm.fecha_desde desc
  limit 1
) mc on true
left join lateral (
  select pwph.holded_product_id
  from public.pedidos_wa_productos_holded pwph
  where l.product_id is null
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
  on ap.product_id = l.product_id
left join public.manager_coste_alias_calc aw
  on aw.product_id = pwph_match.holded_product_id
left join public.manager_producto_coste pc2
  on pc2.product_id = pwph_match.holded_product_id
left join public.manager_coste_producto_calc cpc
  on cpc.product_id = l.product_id
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

-- La vista canónica mantiene exactamente su contrato, pero hereda el fallback
-- conservador y la resolución única.
create or replace view public.manager_lineas_efectivas
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
  l.total_linea,
  l.coste_unidad,
  l.cogs_linea,
  l.margen_linea,
  coalesce(a.alias_to, e.contact_name) as contact_name_canon,
  e.contact_name as contact_name_raw
from public.manager_lineas_coste_resuelto l
join public.manager_ventas_efectivas e on e.id = l.factura_id
left join public.manager_clientes_alias a on a.alias_from = e.contact_name;

alter view public.manager_lineas_efectivas owner to postgres;
alter view public.manager_lineas_efectivas set (security_invoker = true);
revoke select on public.manager_lineas_efectivas from anon;
grant select on public.manager_lineas_efectivas to authenticated;

create or replace function public.manager_factura_detalle(p_factura_id text)
returns table(
  id text,
  nombre text,
  product_id text,
  sku text,
  units numeric,
  price numeric,
  discount numeric,
  tax_rate numeric,
  subtotal numeric,
  coste_unidad numeric,
  cogs_linea numeric,
  margen_linea numeric
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    l.id,
    coalesce(nullif(trim(l.nombre), ''), '(sin nombre)') as nombre,
    l.product_id,
    l.sku,
    l.units,
    l.price,
    l.discount,
    l.tax_rate,
    l.subtotal,
    l.coste_unidad,
    l.cogs_linea,
    l.margen_linea
  from public.manager_lineas_coste_resuelto l
  where l.factura_id = p_factura_id
    and public.puede_ver_manager()
  order by l.id;
$function$;

revoke all on function public.manager_factura_detalle(text) from public, anon;
grant execute on function public.manager_factura_detalle(text) to authenticated;

-- Cambia el RETURNS TABLE para exponer el número de líneas pendientes.
drop function if exists public.manager_facturas_lista(date, date, text, text, text, integer, integer);

create function public.manager_facturas_lista(
  p_from date,
  p_to date,
  p_tipo text default null,
  p_subtipo text default null,
  p_q text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  id text,
  tipo text,
  subtipo text,
  doc_number text,
  contact_id text,
  contact_name_raw text,
  contact_name_canon text,
  fecha date,
  fecha_vencimiento date,
  subtotal numeric,
  total numeric,
  cogs numeric,
  margen numeric,
  margen_pct numeric,
  costes_pendientes bigint,
  payments_pending numeric,
  status integer,
  total_count bigint
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with margen as (
    select
      l.factura_id,
      coalesce(sum(l.cogs_linea), 0) as cogs,
      coalesce(sum(l.subtotal), 0) as ventas_lineas,
      count(*) filter (where l.coste_pendiente) as costes_pendientes
    from public.manager_lineas_coste_resuelto l
    where l.fecha between p_from and p_to
    group by l.factura_id
  ),
  filtered as (
    select f.*, coalesce(a.alias_to, f.contact_name) as contact_name_canon_col
    from public.manager_facturas f
    left join public.manager_clientes_alias a on a.alias_from = f.contact_name
    where f.fecha between p_from and p_to
      and (p_tipo is null or f.tipo = p_tipo)
      and (p_subtipo is null or f.subtipo = p_subtipo)
      and (
        p_q is null or p_q = ''
        or f.doc_number ilike '%' || p_q || '%'
        or f.contact_name ilike '%' || p_q || '%'
        or coalesce(a.alias_to, '') ilike '%' || p_q || '%'
      )
      and public.puede_ver_manager()
  )
  select
    f.id,
    f.tipo,
    f.subtipo,
    f.doc_number,
    f.contact_id,
    f.contact_name as contact_name_raw,
    f.contact_name_canon_col,
    f.fecha,
    f.fecha_vencimiento,
    f.subtotal,
    f.total,
    coalesce(m.cogs, 0),
    coalesce(m.ventas_lineas - m.cogs, 0),
    case
      when coalesce(m.ventas_lineas, 0) > 0
        then round(((m.ventas_lineas - m.cogs) / m.ventas_lineas) * 100, 1)
      else null
    end,
    coalesce(m.costes_pendientes, 0),
    f.payments_pending,
    f.status,
    count(*) over ()
  from filtered f
  left join margen m on m.factura_id = f.id
  order by f.fecha desc, f.doc_number desc
  limit p_limit
  offset p_offset;
$function$;

revoke all on function public.manager_facturas_lista(date, date, text, text, text, integer, integer) from public, anon;
grant execute on function public.manager_facturas_lista(date, date, text, text, text, integer, integer) to authenticated;
