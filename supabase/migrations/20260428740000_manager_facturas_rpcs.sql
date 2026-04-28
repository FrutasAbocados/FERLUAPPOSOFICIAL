-- ============================================================================
-- Manager — RPCs FacturasView (lista filtrable + drill-in líneas)
-- ============================================================================
-- 2 funciones (security invoker):
--   manager_facturas_lista(from, to, tipo, subtipo, q, limit)
--   manager_factura_detalle(factura_id) → cabecera + líneas con margen
-- ============================================================================

create or replace function public.manager_facturas_lista(
  p_from    date,
  p_to      date,
  p_tipo    text default null,    -- 'VENTA' | 'COMPRA' | null=todas
  p_subtipo text default null,    -- 'invoice' | 'waybill' | ... | null=todos
  p_q       text default null,    -- substring de doc_number o contact_name
  p_limit   int  default 500
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
  payments_pending   numeric,
  status             int
) language sql security invoker stable as $$
  select
    f.id, f.tipo, f.subtipo, f.doc_number,
    f.contact_id, f.contact_name as contact_name_raw,
    coalesce(a.alias_to, f.contact_name) as contact_name_canon,
    f.fecha, f.fecha_vencimiento,
    f.subtotal, f.total, f.payments_pending, f.status
  from public.manager_facturas f
  left join public.manager_clientes_alias a on a.alias_from = f.contact_name
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
    coalesce(nullif(trim(l.nombre), ''), '(sin nombre)') as nombre,
    l.product_id, l.sku,
    l.units, l.price, l.discount, l.tax_rate, l.subtotal,
    pc.coste_eur                                                                                  as coste_unidad,
    (coalesce(l.units, 0) * coalesce(pc.coste_eur, 0))::numeric(14,4)                            as cogs_linea,
    (coalesce(l.subtotal, 0) - coalesce(l.units, 0) * coalesce(pc.coste_eur, 0))::numeric(14,4)  as margen_linea
  from public.manager_lineas l
  left join public.manager_producto_coste pc on pc.product_id = l.product_id
  where l.factura_id = p_factura_id
  order by l.id;
$$;
