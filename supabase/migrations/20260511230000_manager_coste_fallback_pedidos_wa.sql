-- ============================================================================
-- Manager — COGS/margen realistas para facturas creadas via pedido-a-holded
-- ============================================================================
-- PROBLEMA: las líneas de ventas creadas por pedido-a-holded tienen
-- manager_lineas.product_id = null (Holded no devuelve productId hasta que
-- el borrador se aprueba y se resincronizan). El LEFT JOIN de coste usa
-- product_id → miss → coste_unidad=null → COGS=0 → margen=100%.
--
-- FIX: añadir join secundario vía pedidos_wa_productos_holded (que mapea
-- producto_normalizado WA ↔ holded_product_id). Si l.nombre en minúsculas
-- coincide con producto_normalizado de la tabla de mapeo, se usa el coste
-- del catálogo Holded para ese producto.
--
-- Ámbito: 3 sitios que hacen su propio JOIN con manager_producto_coste:
--   1. manager_lineas_efectivas (vista — propaga a ~8 RPCs y 2 vistas)
--   2. manager_factura_detalle (RPC del modal Factura)
--   3. manager_facturas_lista  (RPC lista facturas con márgenes)
-- ============================================================================


-- ── 1. Vista manager_lineas_efectivas ──────────────────────────────────────
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
  (coalesce(l.subtotal, 0) * (1 + coalesce(l.tax_rate, 0) / 100))::numeric(14,4)                             as total_linea,
  coalesce(pc.coste_eur, pc2.coste_eur)                                                                       as coste_unidad,
  (coalesce(l.units, 0) * coalesce(pc.coste_eur, pc2.coste_eur, 0))::numeric(14,4)                           as cogs_linea,
  (coalesce(l.subtotal, 0) - coalesce(l.units, 0) * coalesce(pc.coste_eur, pc2.coste_eur, 0))::numeric(14,4) as margen_linea,
  coalesce(a.alias_to, e.contact_name)                                                                        as contact_name_canon,
  e.contact_name                                                                                               as contact_name_raw
from public.manager_lineas l
join public.manager_ventas_efectivas e on e.id = l.factura_id
-- Coste primario: por product_id directo
left join public.manager_producto_coste pc on pc.product_id = l.product_id
-- Coste fallback: buscar en mapeo WA↔Holded por nombre (catálogo o nombre WA)
left join lateral (
  select holded_product_id
  from public.pedidos_wa_productos_holded pwph
  where l.product_id is null
    and pwph.holded_product_id != '0'
    and (
      lower(trim(l.nombre)) = lower(pwph.holded_product_name)
      or lower(trim(l.nombre)) = pwph.producto_normalizado
    )
  limit 1
) pwph_match on true
left join public.manager_producto_coste pc2 on pc2.product_id = pwph_match.holded_product_id
left join public.manager_clientes_alias a on a.alias_from = e.contact_name;


-- ── 2. RPC manager_factura_detalle (modal Factura → COSTE/UD + COGS) ───────
create or replace function public.manager_factura_detalle(p_factura_id text)
returns table(
  id              text,
  nombre          text,
  product_id      text,
  sku             text,
  units           numeric,
  price           numeric,
  discount        numeric,
  tax_rate        numeric,
  subtotal        numeric,
  coste_unidad    numeric,
  cogs_linea      numeric,
  margen_linea    numeric
) language sql security invoker stable as $$
  select
    l.id,
    coalesce(nullif(trim(l.nombre), ''), '(sin nombre)')                                                          as nombre,
    l.product_id, l.sku,
    l.units, l.price, l.discount, l.tax_rate, l.subtotal,
    coalesce(pc.coste_eur, pc2.coste_eur)                                                                         as coste_unidad,
    (coalesce(l.units, 0) * coalesce(pc.coste_eur, pc2.coste_eur, 0))::numeric(14,4)                             as cogs_linea,
    (coalesce(l.subtotal, 0) - coalesce(l.units, 0) * coalesce(pc.coste_eur, pc2.coste_eur, 0))::numeric(14,4)   as margen_linea
  from public.manager_lineas l
  left join public.manager_producto_coste pc on pc.product_id = l.product_id
  left join lateral (
    select holded_product_id
    from public.pedidos_wa_productos_holded pwph
    where l.product_id is null
      and pwph.holded_product_id != '0'
      and (
        lower(trim(l.nombre)) = lower(pwph.holded_product_name)
        or lower(trim(l.nombre)) = pwph.producto_normalizado
      )
    limit 1
  ) pwph_match on true
  left join public.manager_producto_coste pc2 on pc2.product_id = pwph_match.holded_product_id
  where l.factura_id = p_factura_id
  order by l.id;
$$;


-- ── 3. RPC manager_facturas_lista (lista facturas con cogs/margen) ──────────
create or replace function public.manager_facturas_lista(
  p_from    date,
  p_to      date,
  p_tipo    text default null,
  p_subtipo text default null,
  p_q       text default null,
  p_limit   int  default 1000
)
returns table(
  id                 text,
  tipo               text,
  subtipo            text,
  doc_number         text,
  contact_id         text,
  contact_name_raw   text,
  contact_name_canon text,
  fecha              date,
  fecha_vencimiento  date,
  subtotal           numeric,
  total              numeric,
  cogs               numeric,
  margen             numeric,
  margen_pct         numeric,
  payments_pending   numeric,
  status             int
) language sql security invoker stable as $$
  with margen as (
    select l.factura_id,
           coalesce(sum(
             coalesce(l.units, 0) * coalesce(pc.coste_eur, pc2.coste_eur, 0)
           ), 0) as cogs,
           coalesce(sum(l.subtotal), 0) as ventas_lineas
    from public.manager_lineas l
    left join public.manager_producto_coste pc on pc.product_id = l.product_id
    left join lateral (
      select holded_product_id
      from public.pedidos_wa_productos_holded pwph
      where l.product_id is null
        and pwph.holded_product_id != '0'
        and (
          lower(trim(l.nombre)) = lower(pwph.holded_product_name)
          or lower(trim(l.nombre)) = pwph.producto_normalizado
        )
      limit 1
    ) pwph_match on true
    left join public.manager_producto_coste pc2 on pc2.product_id = pwph_match.holded_product_id
    where l.fecha between p_from and p_to
    group by l.factura_id
  )
  select
    f.id, f.tipo, f.subtipo, f.doc_number,
    f.contact_id,
    f.contact_name as contact_name_raw,
    coalesce(a.alias_to, f.contact_name) as contact_name_canon,
    f.fecha, f.fecha_vencimiento,
    f.subtotal, f.total,
    coalesce(m.cogs, 0)                                          as cogs,
    coalesce(m.ventas_lineas - m.cogs, 0)                        as margen,
    case when coalesce(m.ventas_lineas, 0) > 0
         then round(((m.ventas_lineas - m.cogs) / m.ventas_lineas) * 100, 1)
         else null end                                           as margen_pct,
    f.payments_pending, f.status
  from public.manager_facturas f
  left join public.manager_clientes_alias a on a.alias_from = f.contact_name
  left join margen m on m.factura_id = f.id
  where f.fecha between p_from and p_to
    and (p_tipo    is null or f.tipo    = p_tipo)
    and (p_subtipo is null or f.subtipo = p_subtipo)
    and (
      p_q is null or p_q = ''
      or f.doc_number ilike '%' || p_q || '%'
      or f.contact_name ilike '%' || p_q || '%'
      or coalesce(a.alias_to, '') ilike '%' || p_q || '%'
    )
  order by f.fecha desc, f.doc_number desc
  limit p_limit;
$$;
