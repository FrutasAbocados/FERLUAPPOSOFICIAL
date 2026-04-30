-- ============================================================================
-- Dashboard — fix `ventas_hoy` no contar facturas agregadas de albarán
-- ============================================================================
-- A fin de mes Holded genera 1 invoice agregada por cada cliente con waybills
-- en el mes (la "facturación de albaranes"). Esa invoice NO es venta nueva,
-- es la materialización contable de los waybills ya contados a lo largo del
-- mes. Sumarla al "ventas_hoy" del último día del mes inflaba el KPI ~8-12×
-- (medido contra prod 2026-04-30 y 2026-03-31).
--
-- La regla "auto albarán" ya existe en la vista `manager_ventas_efectivas`
-- (migración 20260428650000): si en un mes el cliente tiene >=1 waybill, sus
-- invoice de ese mes se ignoran. Esta migración cambia el FROM de la RPC
-- `dashboard_kpis_hoy` para usar la vista en vez de la tabla cruda.
--
-- Las compras del día siguen leyendo `manager_facturas` cruda (las compras no
-- tienen análogo de waybill agregada).
-- ============================================================================

create or replace function public.dashboard_kpis_hoy()
returns table(
  ventas_hoy         numeric,
  compras_hoy        numeric,
  docs_hoy           int,
  pendiente_mes      numeric,
  ultimo_sync_at     timestamptz,
  ultimo_sync_ok     boolean,
  minutos_desde_sync int
) language sql security invoker stable as $$
  with ventas as (
    select
      coalesce(sum(total), 0) as ventas,
      count(*)                as docs_v
    from public.manager_ventas_efectivas
    where tipo = 'VENTA'
      and fecha = current_date
  ),
  compras as (
    select
      coalesce(sum(total), 0) as compras,
      count(*)                as docs_c
    from public.manager_facturas
    where tipo = 'COMPRA'
      and fecha = current_date
  ),
  pend as (
    select coalesce(sum(case when subtipo = 'waybill' then total else 0 end), 0) as pend
    from public.manager_ventas_efectivas
    where fecha >= date_trunc('month', current_date)
  ),
  sync as (
    select started_at, ok
    from public.manager_holded_sync
    order by started_at desc
    limit 1
  )
  select
    ventas.ventas,
    compras.compras,
    (ventas.docs_v + compras.docs_c)::int as docs_hoy,
    pend.pend,
    sync.started_at,
    sync.ok,
    (extract(epoch from (now() - sync.started_at))::int / 60) as minutos
  from ventas, compras, pend, sync;
$$;
