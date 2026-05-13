-- ============================================================================
-- Manager — añadir fallback coste por nombre al overload 7-param de
--           manager_facturas_lista (el que usa el frontend con p_offset)
-- ============================================================================
-- PROBLEMA: existen dos overloads de la función. El fix de 2026-05-11
-- (migración 20260511230000) añadió el LEFT JOIN LATERAL a pedidos_wa_productos_holded
-- solo en el overload de 6 parámetros. El frontend llama con p_offset → resuelve
-- al overload de 7 parámetros → sin fallback → COGS=0 en líneas con product_id=null
-- → margen=100% en facturas creadas via módulo pedidos.
--
-- FIX: reescribir el overload 7-param con el mismo bloque lateral que ya tiene
-- el de 6 parámetros. El resto (paginación, total_count, filtered CTE) no cambia.
-- ============================================================================

create or replace function public.manager_facturas_lista(
  p_from    date,
  p_to      date,
  p_tipo    text    default null,
  p_subtipo text    default null,
  p_q       text    default null,
  p_limit   integer default 100,
  p_offset  integer default 0
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
  status             integer,
  total_count        bigint
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
  ),
  filtered as (
    select f.*, coalesce(a.alias_to, f.contact_name) as contact_name_canon
    from public.manager_facturas f
    left join public.manager_clientes_alias a on a.alias_from = f.contact_name
    where f.fecha between p_from and p_to
      and (p_tipo    is null or f.tipo    = p_tipo)
      and (p_subtipo is null or f.subtipo = p_subtipo)
      and (
        p_q is null or p_q = ''
        or f.doc_number   ilike '%' || p_q || '%'
        or f.contact_name ilike '%' || p_q || '%'
        or coalesce(a.alias_to, '') ilike '%' || p_q || '%'
      )
  )
  select
    f.id, f.tipo, f.subtipo, f.doc_number,
    f.contact_id,
    f.contact_name as contact_name_raw,
    f.contact_name_canon,
    f.fecha, f.fecha_vencimiento,
    f.subtotal, f.total,
    coalesce(m.cogs, 0)                                           as cogs,
    coalesce(m.ventas_lineas - m.cogs, 0)                         as margen,
    case when coalesce(m.ventas_lineas, 0) > 0
         then round(((m.ventas_lineas - m.cogs) / m.ventas_lineas) * 100, 1)
         else null end                                            as margen_pct,
    f.payments_pending, f.status,
    count(*) over ()                                              as total_count
  from filtered f
  left join margen m on m.factura_id = f.id
  order by f.fecha desc, f.doc_number desc
  limit p_limit
  offset p_offset;
$$;
