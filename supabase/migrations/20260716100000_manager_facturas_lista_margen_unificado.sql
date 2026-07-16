-- Manager — unificar el motor de margen de la lista de facturas con el del detalle.
--
-- Problema: manager_facturas_lista calculaba el COGS con un motor pobre (solo
-- manager_producto_coste por product_id + fallback pedidos-WA), mientras que
-- manager_factura_detalle usa la jerarquía completa de costes. Resultado: el
-- "margen de fuera" (lista) no coincidía con el "de dentro" (detalle real).
-- Ej. facturas del Abuelo julio: fuera ~29% vs real ~59%.
--
-- Fix: el CTE `margen` usa exactamente la misma resolución de coste por línea que
-- manager_factura_detalle, sobre manager_lineas directo (cubre TODAS las facturas,
-- incluidas las ~28 invoices fuera de manager_ventas_efectivas y las del Abuelo).
-- Validado: coincide con manager_factura_detalle al céntimo.

-- Overload legacy de 6 argumentos (sin p_offset): ya no lo llama nadie.
drop function if exists public.manager_facturas_lista(date, date, text, text, text, integer);

create or replace function public.manager_facturas_lista(
  p_from date,
  p_to date,
  p_tipo text default null,
  p_subtipo text default null,
  p_q text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  id text, tipo text, subtipo text, doc_number text, contact_id text,
  contact_name_raw text, contact_name_canon text, fecha date, fecha_vencimiento date,
  subtotal numeric, total numeric, cogs numeric, margen numeric, margen_pct numeric,
  payments_pending numeric, status integer, total_count bigint
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with margen as (
    select
      l.factura_id,
      coalesce(sum(
        coalesce(l.units, 0) * coalesce(
          mcn.coste_eur,
          mc.coste_eur,
          case when pc2.es_manual then pc2.coste_eur else null end,
          ap.coste_eur, aw.coste_eur, cpc.coste_eur, cpw.coste_eur, cnc.coste_eur,
          pc2.coste_eur, 0
        )
      ), 0) as cogs,
      coalesce(sum(l.subtotal), 0) as ventas_lineas
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
      where l.product_id is null and pwph.holded_product_id <> '0'
        and (lower(trim(l.nombre)) = lower(pwph.holded_product_name)
             or lower(trim(l.nombre)) = pwph.producto_normalizado)
      limit 1
    ) pwph_match on true
    left join public.manager_coste_alias_calc ap on ap.product_id = l.product_id
    left join public.manager_coste_alias_calc aw on aw.product_id = pwph_match.holded_product_id
    left join public.manager_producto_coste pc2 on pc2.product_id = pwph_match.holded_product_id
    left join public.manager_coste_producto_calc cpc on cpc.product_id = l.product_id
    left join public.manager_coste_producto_calc cpw on cpw.product_id = pwph_match.holded_product_id
    left join public.manager_coste_nombre_calc cnc on cnc.nombre_norm = lower(trim(l.nombre))
    where l.fecha between p_from and p_to
    group by l.factura_id
  ),
  filtered as (
    select f.*, coalesce(a.alias_to, f.contact_name) as contact_name_canon_col
    from public.manager_facturas f
    left join public.manager_clientes_alias a on a.alias_from = f.contact_name
    where f.fecha between p_from and p_to
      and (p_tipo    is null or f.tipo    = p_tipo)
      and (p_subtipo is null or f.subtipo = p_subtipo)
      and (p_q is null or p_q = ''
           or f.doc_number   ilike '%' || p_q || '%'
           or f.contact_name ilike '%' || p_q || '%'
           or coalesce(a.alias_to, '') ilike '%' || p_q || '%')
      and public.puede_ver_manager()
  )
  select
    f.id, f.tipo, f.subtipo, f.doc_number,
    f.contact_id,
    f.contact_name as contact_name_raw,
    f.contact_name_canon_col,
    f.fecha, f.fecha_vencimiento,
    f.subtotal, f.total,
    coalesce(m.cogs, 0),
    coalesce(m.ventas_lineas - m.cogs, 0),
    case when coalesce(m.ventas_lineas, 0) > 0
         then round(((m.ventas_lineas - m.cogs) / m.ventas_lineas) * 100, 1)
         else null end,
    f.payments_pending, f.status,
    count(*) over ()
  from filtered f
  left join margen m on m.factura_id = f.id
  order by f.fecha desc, f.doc_number desc
  limit p_limit
  offset p_offset;
$function$;
