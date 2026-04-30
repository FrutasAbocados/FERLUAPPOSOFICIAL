-- ============================================================================
-- Manager — Predictor v2: cadencia mediana + confianza + ticket medio
-- ============================================================================
-- v1 (20260429010000) usaba media simple sin medida de dispersión: un cliente
-- con gaps regulares (7/7/8/6) salía igual que uno irregular (2/30/5/25).
-- v2 sustituye media → mediana (más robusta a outliers) y añade un grado de
-- `confianza` derivado del coeficiente de variación de los gaps. Mantiene
-- todas las columnas v1 al inicio para no romper consumers; añade 3 columnas
-- nuevas al final.
-- ============================================================================

-- v2 cambia el shape de retorno (añade 3 columnas), así que necesita DROP+CREATE
-- en vez de CREATE OR REPLACE.
drop function if exists public.manager_pedidos_proximos();

create function public.manager_pedidos_proximos()
returns table(
  contact_name_canon text,
  ultima_compra      date,
  cadencia_dias      numeric,
  proxima_esperada   date,
  dias_para          int,
  ventas_medias      numeric,
  prioridad          text,
  -- v2 añade ↓
  confianza          text,    -- 'alta' | 'media' | 'baja' (derivada de CV de gaps)
  ticket_medio       numeric, -- ventas_total / ndocs (mismo valor que ventas_medias, explícito)
  pedidos_90d        int
) language sql security invoker stable as $$
  with base as (
    select
      coalesce(contact_name_canon, '(sin contacto)') as cliente,
      fecha,
      total,
      id
    from public.manager_ventas_efectivas_canon
    where fecha >= current_date - 90
  ),
  fechas_uniq as (
    select cliente, fecha
    from base
    group by cliente, fecha
  ),
  fechas_arr as (
    select cliente, array_agg(fecha order by fecha) as fechas
    from fechas_uniq
    group by cliente
  ),
  cliente_stats as (
    select
      cliente,
      max(fecha)             as ultima,
      sum(total)             as ventas_total,
      count(distinct id)     as ndocs,
      count(distinct fecha)  as nfechas
    from base
    group by cliente
    having count(distinct id) >= 3 and count(distinct fecha) >= 3
  ),
  gaps as (
    select fa.cliente,
           (fa.fechas[i+1] - fa.fechas[i])::int as gap
    from fechas_arr fa,
         generate_subscripts(fa.fechas, 1) as i
    where i < array_length(fa.fechas, 1)
  ),
  gap_stats as (
    select
      cliente,
      percentile_cont(0.5) within group (order by gap)::numeric as cadencia_med,
      avg(gap)::numeric                                          as gap_avg,
      stddev_samp(gap)::numeric                                  as gap_std
    from gaps
    group by cliente
  ),
  combinado as (
    select
      cs.cliente,
      cs.ultima,
      cs.ventas_total,
      cs.ndocs,
      gs.cadencia_med,
      gs.gap_avg,
      gs.gap_std,
      (cs.ultima + (gs.cadencia_med * interval '1 day'))::date as proxima
    from cliente_stats cs
    join gap_stats gs on gs.cliente = cs.cliente
  )
  select
    c.cliente                                        as contact_name_canon,
    c.ultima                                         as ultima_compra,
    round(c.cadencia_med, 1)                         as cadencia_dias,
    c.proxima                                        as proxima_esperada,
    (c.proxima - current_date)::int                  as dias_para,
    round((c.ventas_total / nullif(c.ndocs, 0))::numeric, 0) as ventas_medias,
    case
      when (c.proxima - current_date) < 0  then 'urgente'
      when (c.proxima - current_date) <= 3 then 'pronto'
      else 'esta_semana'
    end                                              as prioridad,
    case
      when c.gap_avg is null or c.gap_avg = 0       then 'media'
      when c.gap_std / c.gap_avg < 0.4              then 'alta'
      when c.gap_std / c.gap_avg < 0.7              then 'media'
      else                                                'baja'
    end                                              as confianza,
    round((c.ventas_total / nullif(c.ndocs, 0))::numeric, 0) as ticket_medio,
    c.ndocs::int                                     as pedidos_90d
  from combinado c
  where (c.proxima - current_date) <= 7
    and (current_date - c.ultima) <= c.cadencia_med * 1.8 + 3
  order by
    case when (c.proxima - current_date) < 0 then 0 else 1 end,
    (c.proxima - current_date),
    c.ventas_total desc;
$$;
