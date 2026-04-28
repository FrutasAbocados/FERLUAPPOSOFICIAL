-- ============================================================================
-- Manager — TOTAL (con IVA) en RPCs como Holded
-- ============================================================================
-- Decisión UX: el frontend muestra cifras CON IVA (igual que Holded) para que
-- los números cuadren al céntimo. Margen y margen % siguen calculándose sobre
-- SUBTOTAL real (sin IVA) — el IVA no es ingreso ni coste real.
--
-- 1. Reescribe manager_lineas_efectivas para incluir tax_rate y total_linea.
-- 2. Actualiza top_clientes_margen con ventas_total desde cabeceras.
-- 3. Actualiza top_productos_margen con ventas_total = sum(total_linea).
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
  l.tax_rate,
  l.subtotal,
  (coalesce(l.subtotal, 0) * (1 + coalesce(l.tax_rate, 0) / 100))::numeric(14,4)               as total_linea,
  pc.coste_eur                                                                                  as coste_unidad,
  (coalesce(l.units, 0) * coalesce(pc.coste_eur, 0))::numeric(14,4)                            as cogs_linea,
  (coalesce(l.subtotal, 0) - coalesce(l.units, 0) * coalesce(pc.coste_eur, 0))::numeric(14,4)  as margen_linea,
  coalesce(a.alias_to, e.contact_name)                                                          as contact_name_canon,
  e.contact_name                                                                                as contact_name_raw
from public.manager_lineas l
join public.manager_ventas_efectivas e on e.id = l.factura_id
left join public.manager_producto_coste pc on pc.product_id = l.product_id
left join public.manager_clientes_alias a  on a.alias_from = e.contact_name;


-- ----------------------------------------------------------------------------
-- Top clientes — ordenado por ventas_total (con IVA, cabecera)
-- ----------------------------------------------------------------------------
drop function if exists public.manager_top_clientes_margen(date, date, int);
create function public.manager_top_clientes_margen(
  p_from date, p_to date, p_limit int default 10
)
returns table(
  contact_name_canon text,
  docs               bigint,
  unidades           numeric,
  ventas             numeric,    -- TOTAL con IVA (cabecera) — visible
  ventas_subtotal    numeric,
  cogs               numeric,
  margen             numeric,    -- subtotal - cogs (sin IVA)
  margen_pct         numeric     -- sobre subtotal
) language sql security invoker stable as $$
  with cab as (
    select coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
           count(distinct id)        as docs,
           coalesce(sum(total), 0)   as ventas_total
    from public.manager_ventas_efectivas_canon
    where fecha between p_from and p_to
    group by 1
  ),
  lin as (
    select coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
           coalesce(sum(units), 0)        as unidades,
           coalesce(sum(subtotal), 0)     as ventas_subtotal,
           coalesce(sum(cogs_linea), 0)   as cogs,
           coalesce(sum(margen_linea), 0) as margen
    from public.manager_lineas_efectivas
    where fecha between p_from and p_to
    group by 1
  )
  select
    cab.contact_name_canon,
    cab.docs,
    coalesce(lin.unidades, 0)        as unidades,
    cab.ventas_total                 as ventas,
    coalesce(lin.ventas_subtotal, 0) as ventas_subtotal,
    coalesce(lin.cogs, 0)            as cogs,
    coalesce(lin.margen, 0)          as margen,
    case when coalesce(lin.ventas_subtotal, 0) > 0
         then round((lin.margen / lin.ventas_subtotal) * 100, 1)
         else null end               as margen_pct
  from cab
  left join lin using (contact_name_canon)
  order by cab.ventas_total desc nulls last
  limit p_limit;
$$;


-- ----------------------------------------------------------------------------
-- Serie diaria — totales con IVA (cabeceras)
-- ----------------------------------------------------------------------------
create or replace function public.manager_serie_diaria(p_from date, p_to date)
returns table(
  fecha   date,
  ventas  numeric,
  compras numeric,
  margen  numeric
) language sql security invoker stable as $$
  with v as (
    select fecha, coalesce(sum(total), 0) as ventas
    from public.manager_ventas_efectivas
    where fecha between p_from and p_to
    group by 1
  ),
  c as (
    select fecha, coalesce(sum(total), 0) as compras
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


-- ----------------------------------------------------------------------------
-- Top productos — ordenado por ventas_total (con IVA, suma de líneas)
-- ----------------------------------------------------------------------------
drop function if exists public.manager_top_productos_margen(date, date, int);
create function public.manager_top_productos_margen(
  p_from date, p_to date, p_limit int default 10
)
returns table(
  nombre          text,
  product_id      text,
  unidades        numeric,
  ventas          numeric,    -- TOTAL con IVA — visible
  ventas_subtotal numeric,
  cogs            numeric,
  margen          numeric,
  margen_pct      numeric
) language sql security invoker stable as $$
  select
    coalesce(nullif(trim(nombre), ''), '(sin nombre)') as nombre,
    product_id,
    coalesce(sum(units), 0)                            as unidades,
    coalesce(sum(total_linea), 0)                      as ventas,
    coalesce(sum(subtotal), 0)                         as ventas_subtotal,
    coalesce(sum(cogs_linea), 0)                       as cogs,
    coalesce(sum(margen_linea), 0)                     as margen,
    case when sum(subtotal) > 0
         then round((sum(margen_linea) / sum(subtotal)) * 100, 1)
         else null end                                 as margen_pct
  from public.manager_lineas_efectivas
  where fecha between p_from and p_to
  group by 1, 2
  order by ventas desc nulls last
  limit p_limit;
$$;
