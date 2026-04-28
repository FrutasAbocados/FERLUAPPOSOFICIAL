-- ============================================================================
-- Manager — pendiente cobro = total de waybills del periodo
-- ============================================================================
-- Realidad del negocio Ferlu:
--   - invoice (al momento): se cobra al entregar → pendiente = 0
--   - salesreceipt (TPV): cobrado al momento → pendiente = 0
--   - creditnote (abono): ya devuelto → pendiente = 0
--   - waybill (albarán): se acumula y se cobra a fin de mes → PENDIENTE
--
-- Por eso usar el campo Holded `payments_pending` no refleja la deuda real.
-- Cambiamos a: pendiente = sum(total) de waybills del periodo.
-- ============================================================================

-- Resumen del periodo
create or replace function public.manager_resumen_periodo(p_from date, p_to date)
returns table(
  ventas_n           bigint,
  ventas_subtotal    numeric,
  ventas_total       numeric,
  pendiente_cobro    numeric,
  compras_n          bigint,
  compras_subtotal   numeric,
  compras_total      numeric,
  cogs               numeric,
  ventas_lineas      numeric,
  margen_real        numeric,
  margen_pct         numeric
) language sql security invoker stable as $$
  with v as (
    select count(*)                            as n,
           coalesce(sum(subtotal), 0)          as subtotal,
           coalesce(sum(total), 0)             as total,
           coalesce(sum(case when subtipo = 'waybill' then total else 0 end), 0) as pend
    from public.manager_ventas_efectivas
    where fecha between p_from and p_to
  ),
  c as (
    select count(*)                  as n,
           coalesce(sum(subtotal),0) as subtotal,
           coalesce(sum(total),0)    as total
    from public.manager_facturas
    where tipo = 'COMPRA' and fecha between p_from and p_to
  ),
  m as (
    select coalesce(sum(cogs_linea), 0)   as cogs,
           coalesce(sum(subtotal),  0)    as ventas_lineas
    from public.manager_lineas_efectivas
    where fecha between p_from and p_to
  )
  select v.n, v.subtotal, v.total, v.pend,
         c.n, c.subtotal, c.total,
         m.cogs, m.ventas_lineas,
         (m.ventas_lineas - m.cogs)                                  as margen_real,
         case when m.ventas_lineas > 0
              then round(((m.ventas_lineas - m.cogs) / m.ventas_lineas) * 100, 1)
              else null end                                          as margen_pct
  from v, c, m;
$$;


-- Lista de clientes (regenerar para usar el mismo criterio)
drop function if exists public.manager_clientes_lista(date, date);
create function public.manager_clientes_lista(p_from date, p_to date)
returns table(
  contact_id          text,
  contact_name_canon  text,
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
      e.contact_id,
      coalesce(e.contact_name_canon, '(sin contacto)') as contact_name_canon,
      count(distinct e.id)                                                          as docs,
      coalesce(sum(e.total), 0)                                                     as ventas,
      coalesce(sum(case when e.subtipo = 'waybill' then e.total else 0 end), 0)    as pendiente,
      max(e.fecha)                                                                  as ultima_compra,
      count(distinct e.contact_name)                                                as num_alias
    from public.manager_ventas_efectivas_canon e
    where e.fecha between p_from and p_to
    group by 1, 2
  ),
  lin as (
    select
      l.contact_id,
      coalesce(sum(l.subtotal), 0)     as ventas_subtotal,
      coalesce(sum(l.cogs_linea), 0)   as cogs,
      coalesce(sum(l.margen_linea), 0) as margen
    from public.manager_lineas_efectivas l
    where l.fecha between p_from and p_to
    group by 1
  )
  select
    cab.contact_id,
    cab.contact_name_canon,
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
  left join lin on lin.contact_id = cab.contact_id
  order by cab.ventas desc nulls last;
$$;
