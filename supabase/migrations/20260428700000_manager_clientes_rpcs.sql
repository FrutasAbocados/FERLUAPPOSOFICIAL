-- ============================================================================
-- Manager — RPCs ClientesView (lista + drill-in)
-- ============================================================================
-- 3 funciones (security invoker, RLS admin_full de tablas base):
--   manager_clientes_lista(from, to)
--   manager_cliente_facturas(contact_id, from, to)
--   manager_cliente_productos(contact_id, from, to)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Lista de TODOS los clientes con métricas del periodo
-- ---------------------------------------------------------------------------
create or replace function public.manager_clientes_lista(p_from date, p_to date)
returns table(
  contact_id          text,
  contact_name_canon  text,
  docs                bigint,
  ventas              numeric,    -- total con IVA
  ventas_subtotal     numeric,    -- sin IVA
  cogs                numeric,
  margen              numeric,
  margen_pct          numeric,
  pendiente_cobro     numeric,
  ultima_compra       date,
  num_aliases         int         -- cuántos contact_name distintos están unificados
) language sql security invoker stable as $$
  with cab as (
    select
      e.contact_id,
      coalesce(e.contact_name_canon, '(sin contacto)') as contact_name_canon,
      count(distinct e.id)               as docs,
      coalesce(sum(e.total), 0)          as ventas,
      coalesce(sum(e.payments_pending), 0) as pendiente,
      max(e.fecha)                       as ultima_compra,
      count(distinct e.contact_name)     as num_alias
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


-- ---------------------------------------------------------------------------
-- Facturas/albaranes de UN cliente (por contact_id)
-- ---------------------------------------------------------------------------
create or replace function public.manager_cliente_facturas(
  p_contact_id text, p_from date, p_to date
)
returns table(
  id                 text,
  doc_number         text,
  subtipo            text,
  fecha              date,
  fecha_vencimiento  date,
  subtotal           numeric,
  total              numeric,
  payments_pending   numeric,
  status             int
) language sql security invoker stable as $$
  select id, doc_number, subtipo, fecha, fecha_vencimiento,
         subtotal, total, payments_pending, status
  from public.manager_ventas_efectivas
  where contact_id = p_contact_id
    and fecha between p_from and p_to
  order by fecha desc, doc_number desc;
$$;


-- ---------------------------------------------------------------------------
-- Productos favoritos de UN cliente
-- ---------------------------------------------------------------------------
create or replace function public.manager_cliente_productos(
  p_contact_id text, p_from date, p_to date, p_limit int default 20
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
  where contact_id = p_contact_id
    and fecha between p_from and p_to
  group by 1, 2
  order by ventas_subtotal desc nulls last
  limit p_limit;
$$;
