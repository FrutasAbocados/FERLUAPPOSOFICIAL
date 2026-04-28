-- ============================================================================
-- Manager — Forecast + Comparativo periodo anterior + Deuda acumulada
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Resumen ampliado con comparativa al periodo anterior equivalente
-- ---------------------------------------------------------------------------
create or replace function public.manager_resumen_comparativo(p_from date, p_to date)
returns table(
  ventas              numeric,
  ventas_ant          numeric,
  ventas_delta_pct    numeric,
  compras             numeric,
  compras_ant         numeric,
  compras_delta_pct   numeric,
  margen              numeric,
  margen_ant          numeric,
  margen_delta_pct    numeric,
  pendiente_cobro     numeric,
  docs                bigint,
  cogs                numeric,
  margen_pct          numeric,
  comp_from           date,
  comp_to             date
) language sql security invoker stable as $$
  with span as (
    select (p_to - p_from + 1)::int as ndias
  ),
  ranges as (
    select
      p_from                                         as actual_from,
      p_to                                           as actual_to,
      (p_from - (select ndias from span))::date      as ant_from,
      (p_from - 1)::date                             as ant_to
  ),
  v_act as (
    select
      coalesce(sum(e.total), 0)                                                  as ventas,
      coalesce(sum(case when e.subtipo='waybill' then e.total else 0 end), 0)    as pendiente,
      count(distinct e.id)                                                       as docs
    from public.manager_ventas_efectivas e, ranges r
    where e.fecha between r.actual_from and r.actual_to
  ),
  v_ant as (
    select coalesce(sum(e.total), 0) as ventas
    from public.manager_ventas_efectivas e, ranges r
    where e.fecha between r.ant_from and r.ant_to
  ),
  c_act as (
    select coalesce(sum(total), 0) as compras
    from public.manager_facturas, ranges r
    where tipo = 'COMPRA' and fecha between r.actual_from and r.actual_to
  ),
  c_ant as (
    select coalesce(sum(total), 0) as compras
    from public.manager_facturas, ranges r
    where tipo = 'COMPRA' and fecha between r.ant_from and r.ant_to
  ),
  m_act as (
    select coalesce(sum(margen_linea), 0) as margen,
           coalesce(sum(cogs_linea), 0)   as cogs,
           coalesce(sum(subtotal), 0)     as ventas_lineas
    from public.manager_lineas_efectivas, ranges r
    where fecha between r.actual_from and r.actual_to
  ),
  m_ant as (
    select coalesce(sum(margen_linea), 0) as margen
    from public.manager_lineas_efectivas, ranges r
    where fecha between r.ant_from and r.ant_to
  )
  select
    v_act.ventas, v_ant.ventas,
    case when v_ant.ventas > 0 then round(((v_act.ventas - v_ant.ventas) / v_ant.ventas) * 100, 1) else null end as ventas_delta_pct,
    c_act.compras, c_ant.compras,
    case when c_ant.compras > 0 then round(((c_act.compras - c_ant.compras) / c_ant.compras) * 100, 1) else null end as compras_delta_pct,
    m_act.margen, m_ant.margen,
    case when m_ant.margen != 0 then round(((m_act.margen - m_ant.margen) / abs(m_ant.margen)) * 100, 1) else null end as margen_delta_pct,
    v_act.pendiente,
    v_act.docs,
    m_act.cogs,
    case when m_act.ventas_lineas > 0 then round((m_act.margen / m_act.ventas_lineas) * 100, 1) else null end as margen_pct,
    r.ant_from, r.ant_to
  from v_act, v_ant, c_act, c_ant, m_act, m_ant, ranges r;
$$;


-- ---------------------------------------------------------------------------
-- 2. Forecast próximo mes (media ventas de últimos 3 meses naturales completos)
-- ---------------------------------------------------------------------------
create or replace function public.manager_forecast_proximo_mes()
returns table(
  forecast        numeric,
  base_meses      int,
  meses_usados    text,
  mes_actual_proy numeric,        -- proyección del mes en curso (% transcurrido)
  pct_mes         numeric         -- porcentaje del mes actual transcurrido
) language sql security invoker stable as $$
  with meses_completos as (
    -- 3 últimos meses completos (no incluye el actual)
    select
      date_trunc('month', current_date) - (n || ' month')::interval as mes_inicio,
      (date_trunc('month', current_date) - ((n - 1) || ' month')::interval - interval '1 day')::date as mes_fin
    from generate_series(1, 3) n
  ),
  ventas_meses as (
    select
      to_char(mc.mes_inicio, 'Mon YYYY') as mes_label,
      coalesce(sum(e.total), 0)          as ventas
    from meses_completos mc
    left join public.manager_ventas_efectivas e
      on e.fecha between mc.mes_inicio::date and mc.mes_fin
    group by mc.mes_inicio
    order by mc.mes_inicio desc
  ),
  agg as (
    select
      avg(ventas)                                       as forecast,
      count(*)                                          as base,
      string_agg(mes_label, ', ' order by mes_label)    as meses
    from ventas_meses
    where ventas > 0
  ),
  mes_actual as (
    select coalesce(sum(total), 0) as ventas_mtd
    from public.manager_ventas_efectivas
    where fecha >= date_trunc('month', current_date)
      and fecha <= current_date
  ),
  pct as (
    select round(
      (extract(day from current_date)::numeric /
       extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))) * 100,
      1
    ) as p
  )
  select
    round(agg.forecast, 0)                              as forecast,
    agg.base::int                                       as base_meses,
    agg.meses                                           as meses_usados,
    case when pct.p > 0 then round(mes_actual.ventas_mtd * 100 / pct.p, 0) else 0 end as mes_actual_proy,
    pct.p                                               as pct_mes
  from agg, mes_actual, pct;
$$;


-- ---------------------------------------------------------------------------
-- 3. Pendiente acumulado Manager últimos N meses (para cuadrar con Cobros)
-- ---------------------------------------------------------------------------
create or replace function public.manager_pendiente_acumulado(p_meses int default 6)
returns table(
  contact_name_canon text,
  pendiente_total    numeric,        -- waybills últimos N meses sin cobrar (asumido)
  ultimo_pedido      date
) language sql security invoker stable as $$
  select
    coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
    coalesce(sum(case when subtipo = 'waybill' then total else 0 end), 0) as pendiente_total,
    max(fecha) as ultimo_pedido
  from public.manager_ventas_efectivas_canon
  where fecha >= current_date - (p_meses * 30)
  group by 1
  having coalesce(sum(case when subtipo = 'waybill' then total else 0 end), 0) > 0
  order by pendiente_total desc;
$$;


-- ---------------------------------------------------------------------------
-- 4. Reformula dashboard_pendiente_mismatch usando deuda acumulada (no solo mes)
-- ---------------------------------------------------------------------------
drop function if exists public.dashboard_pendiente_mismatch();
create function public.dashboard_pendiente_mismatch()
returns table(
  cliente_nombre        text,
  pendiente_cobros      numeric,
  pendiente_manager_acu numeric,
  diferencia            numeric,
  match_status          text
) language sql security invoker stable as $$
  with
  cob as (
    select c.nombre as cliente_nombre,
           lower(trim(c.nombre)) as needle,
           coalesce(sum(m.importe - coalesce(m.importe_cobrado, 0)), 0) as pendiente
    from public.cobros_clientes c
    join public.cobros_movimientos m on m.cliente_id = c.id and not m.pagado
    where c.activo
    group by 1, 2
    having coalesce(sum(m.importe - coalesce(m.importe_cobrado, 0)), 0) > 0
  ),
  mgr_match as (
    select cob.cliente_nombre, cob.pendiente,
      coalesce(sum(case when e.subtipo = 'waybill' then e.total else 0 end), 0) as pendiente_acu
    from cob
    left join public.manager_ventas_efectivas_canon e
      on (lower(coalesce(e.contact_name, '')) like '%' || cob.needle || '%'
       or lower(coalesce(e.contact_name_canon, '')) like '%' || cob.needle || '%')
       and e.fecha >= current_date - 180
    group by 1, 2
  )
  select
    cliente_nombre,
    pendiente   as pendiente_cobros,
    pendiente_acu as pendiente_manager_acu,
    (pendiente_acu - pendiente) as diferencia,
    case
      when pendiente_acu = 0 then 'no_en_manager'
      when abs(pendiente - pendiente_acu) < 1 then 'match'
      else 'mismatch'
    end as match_status
  from mgr_match
  order by abs(pendiente - pendiente_acu) desc;
$$;
