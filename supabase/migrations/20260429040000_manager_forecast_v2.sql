-- ============================================================================
-- Manager — Forecast v2 (con tendencia)
-- ============================================================================
-- v1 hacía media plana de meses completos → ignoraba tendencia.
-- v2:
--   1. Calcula serie mensual completa (incluye mes actual proyectado).
--   2. Calcula tendencia geométrica (ratio mes a mes promedio últimos 3 meses).
--   3. Forecast = mes_actual_proy × (1 + tendencia capeada [-25%, +25%]).
--   4. Devuelve también forecast +1, +2, +3 meses para gráfica.
-- ============================================================================

drop function if exists public.manager_forecast_proximo_mes();
create or replace function public.manager_forecast_proximo_mes()
returns table(
  mes_label             text,        -- ej "Mayo 2026"
  forecast_next         numeric,     -- forecast próximo mes
  mes_actual_proy       numeric,     -- proyección mes en curso
  pct_mes               numeric,     -- % transcurrido del mes
  tendencia_pct         numeric,     -- crecimiento mes-a-mes (%) últimos 3 meses
  base_meses            int,
  meses_serie           jsonb        -- [{mes, ventas, es_proy}] últimos 6+actual+next
) language sql security invoker stable as $$
  with mes_actual as (
    select
      coalesce(sum(total), 0)                                                    as ventas_mtd,
      extract(day from current_date)::int                                        as dia_actual,
      extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::int as dia_total
    from public.manager_ventas_efectivas
    where fecha >= date_trunc('month', current_date)
      and fecha <= current_date
  ),
  mes_actual_proy as (
    select
      ventas_mtd,
      case when dia_actual > 0 then ventas_mtd * dia_total / dia_actual else 0 end as proy,
      round(dia_actual * 100.0 / dia_total, 1) as pct
    from mes_actual
  ),
  -- Histórico de meses completos (no incluye el actual)
  meses_completos as (
    select
      date_trunc('month', fecha)::date                          as mes,
      to_char(date_trunc('month', fecha), 'TMMonth YYYY')       as label,
      sum(total)                                                as ventas
    from public.manager_ventas_efectivas
    where fecha < date_trunc('month', current_date)
    group by date_trunc('month', fecha)
    order by 1
  ),
  -- Serie con mes actual al final (proyectado)
  serie as (
    select label, ventas, false as es_proy from meses_completos
    union all
    select to_char(date_trunc('month', current_date), 'TMMonth YYYY'),
           (select proy from mes_actual_proy),
           true
  ),
  -- Tendencia: ratios mes-a-mes últimos 3 (geométrica = media de ratios)
  ratios as (
    select
      ventas / nullif(lag(ventas) over (order by row_number), 0) as ratio
    from (
      select ventas, row_number() over (order by mes) from (
        select mes, ventas from meses_completos order by mes desc limit 4
      ) m order by mes
    ) ord
  ),
  tendencia as (
    select
      coalesce(avg(ratio) - 1, 0) as raw,
      -- capear a [-0.25, 0.25]
      least(0.25, greatest(-0.25, coalesce(avg(ratio) - 1, 0))) as capeada
    from ratios
    where ratio is not null
  ),
  -- Forecast +1
  fc as (
    select
      to_char(date_trunc('month', current_date) + interval '1 month', 'TMMonth YYYY') as label_next,
      (select proy from mes_actual_proy) * (1 + (select capeada from tendencia)) as fc1,
      (select proy from mes_actual_proy) * power(1 + (select capeada from tendencia), 2) as fc2,
      (select proy from mes_actual_proy) * power(1 + (select capeada from tendencia), 3) as fc3
  ),
  serie_full as (
    select jsonb_agg(
      jsonb_build_object('mes', label, 'ventas', round(ventas), 'es_proy', es_proy)
      order by label
    ) as arr
    from (
      select label, ventas, es_proy, label as ord from serie
      union all
      select to_char(date_trunc('month', current_date) + interval '1 month', 'TMMonth YYYY'),
             round((select fc1 from fc)), true,
             to_char(date_trunc('month', current_date) + interval '1 month', 'YYYY-MM-01')
      union all
      select to_char(date_trunc('month', current_date) + interval '2 month', 'TMMonth YYYY'),
             round((select fc2 from fc)), true,
             to_char(date_trunc('month', current_date) + interval '2 month', 'YYYY-MM-01')
      union all
      select to_char(date_trunc('month', current_date) + interval '3 month', 'TMMonth YYYY'),
             round((select fc3 from fc)), true,
             to_char(date_trunc('month', current_date) + interval '3 month', 'YYYY-MM-01')
    ) all_rows
  )
  select
    fc.label_next                                                                as mes_label,
    round(fc.fc1, 0)                                                              as forecast_next,
    round((select proy from mes_actual_proy), 0)                                  as mes_actual_proy,
    (select pct from mes_actual_proy)                                             as pct_mes,
    round((select capeada from tendencia) * 100, 1)                               as tendencia_pct,
    (select count(*) from ratios where ratio is not null)::int                    as base_meses,
    (select arr from serie_full)                                                  as meses_serie
  from fc;
$$;
