-- ============================================================================
-- Manager — Clientes agrupados por contact_name_canon (no contact_id)
-- ============================================================================
-- Bug: si 2 contact_ids distintos están unificados con alias al mismo nombre
-- canónico, agrupar por contact_id devolvía 2 filas. Caso real: Victor Vinilo
-- King (Cocktail) y (Victor Beach) → 21 docs en una fila (la otra perdida).
--
-- Fix: agrupar por contact_name_canon, devolver array_agg de contact_ids para
-- que el drill-in pueda hacer IN().
-- ============================================================================

drop function if exists public.manager_clientes_lista(date, date);
create function public.manager_clientes_lista(p_from date, p_to date)
returns table(
  contact_name_canon  text,
  contact_ids         text[],     -- todos los IDs unificados bajo este nombre
  docs                bigint,
  ventas              numeric,
  ventas_subtotal     numeric,
  cogs                numeric,
  margen              numeric,
  margen_pct          numeric,
  pendiente_cobro     numeric,
  ultima_compra       date,
  num_aliases         int
) language sql security invoker stable as $$
  with cab as (
    select
      coalesce(e.contact_name_canon, '(sin contacto)') as contact_name_canon,
      array_agg(distinct e.contact_id) filter (where e.contact_id is not null) as contact_ids,
      count(distinct e.id)                                                          as docs,
      coalesce(sum(e.total), 0)                                                     as ventas,
      coalesce(sum(case when e.subtipo = 'waybill' then e.total else 0 end), 0)    as pendiente,
      max(e.fecha)                                                                  as ultima_compra,
      count(distinct e.contact_name)                                                as num_alias
    from public.manager_ventas_efectivas_canon e
    where e.fecha between p_from and p_to
    group by 1
  ),
  lin as (
    select
      coalesce(l.contact_name_canon, '(sin contacto)') as contact_name_canon,
      coalesce(sum(l.subtotal), 0)     as ventas_subtotal,
      coalesce(sum(l.cogs_linea), 0)   as cogs,
      coalesce(sum(l.margen_linea), 0) as margen
    from public.manager_lineas_efectivas l
    where l.fecha between p_from and p_to
    group by 1
  )
  select
    cab.contact_name_canon,
    cab.contact_ids,
    cab.docs,
    cab.ventas,
    coalesce(lin.ventas_subtotal, 0)                                    as ventas_subtotal,
    coalesce(lin.cogs, 0)                                               as cogs,
    coalesce(lin.margen, 0)                                             as margen,
    case when coalesce(lin.ventas_subtotal, 0) > 0
         then round((lin.margen / lin.ventas_subtotal) * 100, 1)
         else null end                                                  as margen_pct,
    cab.pendiente                                                       as pendiente_cobro,
    cab.ultima_compra,
    cab.num_alias::int                                                  as num_aliases
  from cab
  left join lin using (contact_name_canon)
  order by cab.ventas desc nulls last;
$$;


-- Drill-in por nombre canónico (acepta múltiples contact_ids unificados)
drop function if exists public.manager_cliente_facturas(text, date, date);
create function public.manager_cliente_facturas(
  p_contact_name_canon text, p_from date, p_to date
)
returns table(
  id                 text,
  doc_number         text,
  subtipo            text,
  contact_name       text,
  fecha              date,
  fecha_vencimiento  date,
  subtotal           numeric,
  total              numeric,
  payments_pending   numeric,
  status             int
) language sql security invoker stable as $$
  select e.id, e.doc_number, e.subtipo, e.contact_name, e.fecha, e.fecha_vencimiento,
         e.subtotal, e.total, e.payments_pending, e.status
  from public.manager_ventas_efectivas_canon e
  where coalesce(e.contact_name_canon, '(sin contacto)') = p_contact_name_canon
    and e.fecha between p_from and p_to
  order by e.fecha desc, e.doc_number desc;
$$;


drop function if exists public.manager_cliente_productos(text, date, date, int);
create function public.manager_cliente_productos(
  p_contact_name_canon text, p_from date, p_to date, p_limit int default 30
)
returns table(
  nombre          text,
  product_id      text,
  veces           bigint,
  unidades        numeric,
  ventas_subtotal numeric,
  cogs            numeric,
  margen          numeric,
  margen_pct      numeric,
  ultima_compra   date
) language sql security invoker stable as $$
  select
    coalesce(nullif(trim(nombre), ''), '(sin nombre)') as nombre,
    product_id,
    count(*)                                           as veces,
    coalesce(sum(units), 0)                            as unidades,
    coalesce(sum(subtotal), 0)                         as ventas_subtotal,
    coalesce(sum(cogs_linea), 0)                       as cogs,
    coalesce(sum(margen_linea), 0)                     as margen,
    case when sum(subtotal) > 0
         then round((sum(margen_linea) / sum(subtotal)) * 100, 1)
         else null end                                 as margen_pct,
    max(fecha)                                         as ultima_compra
  from public.manager_lineas_efectivas
  where coalesce(contact_name_canon, '(sin contacto)') = p_contact_name_canon
    and fecha between p_from and p_to
  group by 1, 2
  order by ventas_subtotal desc nulls last
  limit p_limit;
$$;
