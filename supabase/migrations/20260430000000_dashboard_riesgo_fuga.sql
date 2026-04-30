-- ============================================================================
-- Dashboard — RPC dashboard_clientes_riesgo_fuga()
-- ============================================================================
-- Consolida en una sola alerta los 3 motivos de pérdida de cliente:
--   inactivo   → días_sin_pedir > cadencia × 1.8 + 3 (lo de hoy)
--   ralentiza  → días_sin_pedir entre cadencia × 1.2 + 2 y × 1.8 + 3
--   ticket_cae → ticket medio últimos 30d < 60% del ticket medio 30-90d previo
--                (rolling, requiere ventas previas ≥ 400€ ≈ 200€/mes y ≥2 pedidos)
--
-- Sustituye en el Dashboard a la AlertCard "Clientes inactivos"
-- (la RPC vieja dashboard_clientes_inactivos se mantiene viva por compatibilidad).
-- ============================================================================

create or replace function public.dashboard_clientes_riesgo_fuga()
returns table(
  contact_name_canon       text,
  motivos                  text[],
  severidad                text,         -- 'critica' | 'aviso'
  ultima_compra            date,
  dias_sin_pedir           int,
  cadencia_dias            numeric,
  pedidos_90d              int,
  ventas_90d               numeric,
  ticket_medio_30d         numeric,
  ticket_medio_30_90       numeric,
  valor_perdido_estimado   numeric
) language sql security invoker stable as $$
  with por_cliente as (
    select
      coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
      max(fecha)              as ultima,
      count(distinct id)      as pedidos_90d,
      coalesce(sum(total), 0) as ventas_90d,
      case when count(distinct fecha) > 1
           then ((max(fecha) - min(fecha))::numeric / nullif(count(distinct fecha) - 1, 0))
           else null end      as cadencia,
      coalesce(sum(case when fecha >= current_date - 30 then total else 0 end), 0) as ventas_30d,
      count(distinct case when fecha >= current_date - 30 then id end)              as pedidos_30d,
      coalesce(sum(case when fecha < current_date - 30 then total else 0 end), 0)  as ventas_30_90,
      count(distinct case when fecha < current_date - 30 then id end)               as pedidos_30_90
    from public.manager_ventas_efectivas_canon
    where fecha >= current_date - 90
    group by 1
    having count(distinct id) >= 3
  ),
  con_metricas as (
    select
      contact_name_canon,
      ultima,
      (current_date - ultima)::int as dias_sin_pedir,
      cadencia,
      pedidos_90d,
      ventas_90d,
      ventas_30d,
      ventas_30_90,
      pedidos_30_90,
      case when pedidos_30d    > 0 then ventas_30d    / pedidos_30d    else null end as ticket_30d,
      case when pedidos_30_90  > 0 then ventas_30_90  / pedidos_30_90  else null end as ticket_30_90
    from por_cliente
  ),
  con_motivos as (
    select
      *,
      array_remove(array[
        case when cadencia is not null
              and dias_sin_pedir > cadencia * 1.8 + 3
              then 'inactivo' end,
        case when cadencia is not null
              and dias_sin_pedir > cadencia * 1.2 + 2
              and dias_sin_pedir <= cadencia * 1.8 + 3
              then 'ralentiza' end,
        case when ticket_30_90 is not null
              and pedidos_30_90 >= 2
              and ventas_30_90 >= 400
              and ticket_30d is not null
              and ticket_30d < ticket_30_90 * 0.6
              then 'ticket_cae' end
      ], null) as motivos_calc,
      greatest(0, (ventas_90d / 90.0 * 30) - ventas_30d) as valor_perdido
    from con_metricas
  )
  select
    contact_name_canon,
    motivos_calc                                  as motivos,
    case when 'inactivo' = any(motivos_calc) then 'critica' else 'aviso' end as severidad,
    ultima                                        as ultima_compra,
    dias_sin_pedir,
    round(cadencia, 1)                            as cadencia_dias,
    pedidos_90d::int,
    ventas_90d,
    round(ticket_30d, 2)                          as ticket_medio_30d,
    round(ticket_30_90, 2)                        as ticket_medio_30_90,
    round(valor_perdido, 0)                       as valor_perdido_estimado
  from con_motivos
  where coalesce(array_length(motivos_calc, 1), 0) > 0
  order by
    case when 'inactivo' = any(motivos_calc) then 0 else 1 end,
    valor_perdido desc
  limit 20;
$$;
