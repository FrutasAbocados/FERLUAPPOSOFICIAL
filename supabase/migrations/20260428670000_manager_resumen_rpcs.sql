-- ============================================================================
-- Manager — vista de líneas efectivas con coste + RPCs del Resumen
-- ============================================================================
-- manager_lineas_efectivas: líneas que pertenecen a docs en
-- manager_ventas_efectivas, enriquecidas con coste de producto y nombre
-- canónico de cliente (alias aplicado). Es la fuente para todo análisis de
-- VENTAS y MARGEN REAL en el Manager.
--
-- 4 RPCs (security invoker, respeta RLS admin_full de tablas base):
--   manager_resumen_periodo(from, to)         → KPIs agregados
--   manager_top_clientes_margen(from, to, n)  → top N clientes por margen €
--   manager_top_productos_margen(from, to, n) → top N productos por margen €
--   manager_serie_diaria(from, to)            → ventas/compras/margen por día
-- ============================================================================

drop view if exists public.manager_lineas_efectivas;
create view public.manager_lineas_efectivas
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
  l.subtotal,
  pc.coste_eur                                                      as coste_unidad,
  (coalesce(l.units, 0) * coalesce(pc.coste_eur, 0))::numeric(14,4) as cogs_linea,
  (coalesce(l.subtotal, 0) - coalesce(l.units, 0) * coalesce(pc.coste_eur, 0))::numeric(14,4) as margen_linea,
  coalesce(a.alias_to, e.contact_name)                              as contact_name_canon,
  e.contact_name                                                    as contact_name_raw
from public.manager_lineas l
join public.manager_ventas_efectivas e on e.id = l.factura_id
left join public.manager_producto_coste pc on pc.product_id = l.product_id
left join public.manager_clientes_alias a  on a.alias_from = e.contact_name;


-- ----------------------------------------------------------------------------
-- RPC: resumen del periodo
-- ----------------------------------------------------------------------------
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
           coalesce(sum(payments_pending), 0)  as pend
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


-- ----------------------------------------------------------------------------
-- RPC: top clientes por margen €
-- ----------------------------------------------------------------------------
create or replace function public.manager_top_clientes_margen(
  p_from date, p_to date, p_limit int default 10
)
returns table(
  contact_name_canon text,
  docs               bigint,
  unidades           numeric,
  ventas             numeric,
  cogs               numeric,
  margen             numeric,
  margen_pct         numeric
) language sql security invoker stable as $$
  select
    coalesce(contact_name_canon, '(sin contacto)')             as contact_name_canon,
    count(distinct factura_id)                                 as docs,
    coalesce(sum(units), 0)                                    as unidades,
    coalesce(sum(subtotal), 0)                                 as ventas,
    coalesce(sum(cogs_linea), 0)                               as cogs,
    coalesce(sum(margen_linea), 0)                             as margen,
    case when sum(subtotal) > 0
         then round((sum(margen_linea) / sum(subtotal)) * 100, 1)
         else null end                                         as margen_pct
  from public.manager_lineas_efectivas
  where fecha between p_from and p_to
  group by 1
  order by margen desc nulls last
  limit p_limit;
$$;


-- ----------------------------------------------------------------------------
-- RPC: top productos por margen €
-- ----------------------------------------------------------------------------
create or replace function public.manager_top_productos_margen(
  p_from date, p_to date, p_limit int default 10
)
returns table(
  nombre     text,
  product_id text,
  unidades   numeric,
  ventas     numeric,
  cogs       numeric,
  margen     numeric,
  margen_pct numeric
) language sql security invoker stable as $$
  select
    coalesce(nullif(trim(nombre), ''), '(sin nombre)')         as nombre,
    product_id,
    coalesce(sum(units), 0)                                    as unidades,
    coalesce(sum(subtotal), 0)                                 as ventas,
    coalesce(sum(cogs_linea), 0)                               as cogs,
    coalesce(sum(margen_linea), 0)                             as margen,
    case when sum(subtotal) > 0
         then round((sum(margen_linea) / sum(subtotal)) * 100, 1)
         else null end                                         as margen_pct
  from public.manager_lineas_efectivas
  where fecha between p_from and p_to
  group by 1, 2
  order by margen desc nulls last
  limit p_limit;
$$;


-- ----------------------------------------------------------------------------
-- RPC: serie diaria (ventas / compras / margen)
-- ----------------------------------------------------------------------------
create or replace function public.manager_serie_diaria(p_from date, p_to date)
returns table(
  fecha   date,
  ventas  numeric,
  compras numeric,
  margen  numeric
) language sql security invoker stable as $$
  with v as (
    select fecha, coalesce(sum(subtotal), 0) as ventas
    from public.manager_ventas_efectivas
    where fecha between p_from and p_to
    group by 1
  ),
  c as (
    select fecha, coalesce(sum(subtotal), 0) as compras
    from public.manager_facturas
    where tipo = 'COMPRA' and fecha between p_from and p_to
    group by 1
  ),
  m as (
    select fecha, coalesce(sum(margen_linea), 0) as margen
    from public.manager_lineas_efectivas
    where fecha between p_from and p_to
    group by 1
  )
  select
    d::date,
    coalesce(v.ventas, 0),
    coalesce(c.compras, 0),
    coalesce(m.margen, 0)
  from generate_series(p_from, p_to, '1 day'::interval) d
  left join v on v.fecha = d::date
  left join c on c.fecha = d::date
  left join m on m.fecha = d::date
  order by d;
$$;
