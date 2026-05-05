-- ============================================================================
-- Dashboard KPIs serie diaria (sparklines)
-- ============================================================================
-- Devuelve serie por día de los 4 KPIs del Dashboard para los últimos N días.
-- Mismas reglas que `dashboard_kpis_hoy()`:
--   - ventas usa la vista `manager_ventas_efectivas` (auto albarán aplicada).
--   - compras lee `manager_facturas` cruda.
--   - pendiente = waybills generados ESE día (no acumulado), tendencia diaria.
-- security invoker stable porque solo lee datos ya filtrados por RLS upstream.
-- ============================================================================

create or replace function public.dashboard_kpis_serie(dias int default 7)
returns table(
  fecha     date,
  ventas    numeric,
  compras   numeric,
  docs      int,
  pendiente numeric
) language sql security invoker stable as $$
  with dias_seq as (
    select generate_series(
      current_date - (dias - 1),
      current_date,
      interval '1 day'
    )::date as fecha
  )
  select
    d.fecha,
    coalesce((
      select sum(total)
      from public.manager_ventas_efectivas
      where tipo = 'VENTA' and fecha = d.fecha
    ), 0)::numeric as ventas,
    coalesce((
      select sum(total)
      from public.manager_facturas
      where tipo = 'COMPRA' and fecha = d.fecha
    ), 0)::numeric as compras,
    (
      coalesce((
        select count(*)
        from public.manager_ventas_efectivas
        where tipo = 'VENTA' and fecha = d.fecha
      ), 0)
      + coalesce((
        select count(*)
        from public.manager_facturas
        where tipo = 'COMPRA' and fecha = d.fecha
      ), 0)
    )::int as docs,
    coalesce((
      select sum(total)
      from public.manager_ventas_efectivas
      where subtipo = 'waybill' and fecha = d.fecha
    ), 0)::numeric as pendiente
  from dias_seq d
  order by d.fecha;
$$;
