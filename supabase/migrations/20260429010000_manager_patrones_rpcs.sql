-- ============================================================================
-- Manager — F2 Patrones (día semana + esperados próximos 7 días)
-- ============================================================================
-- 2 RPCs (security invoker):
--   manager_patrones_dia_semana(from, to) — ventas y docs por día semana
--   manager_pedidos_proximos()            — qué clientes deberían pedir y cuándo
-- ============================================================================

create or replace function public.manager_patrones_dia_semana(p_from date, p_to date)
returns table(
  dow      int,    -- 0=domingo, 1=lunes ... 6=sábado
  dia      text,
  ventas   numeric,
  docs     bigint,
  ndias    int     -- número de días reales del periodo que cayeron en ese dow
) language sql security invoker stable as $$
  with d as (
    select fecha,
           extract(dow from fecha)::int as dow,
           coalesce(sum(total), 0)      as ventas,
           count(distinct id)           as docs
    from public.manager_ventas_efectivas
    where fecha between p_from and p_to
    group by 1
  ),
  cal as (
    select extract(dow from gs)::int as dow, count(*) as ndias
    from generate_series(p_from, p_to, '1 day'::interval) gs
    group by 1
  )
  select
    cal.dow,
    case cal.dow
      when 1 then 'Lunes' when 2 then 'Martes' when 3 then 'Miércoles'
      when 4 then 'Jueves' when 5 then 'Viernes' when 6 then 'Sábado'
      else 'Domingo'
    end                                                            as dia,
    coalesce(sum(d.ventas), 0)                                     as ventas,
    coalesce(sum(d.docs), 0)                                       as docs,
    cal.ndias::int                                                 as ndias
  from cal
  left join d on d.dow = cal.dow
  group by cal.dow, cal.ndias
  order by case cal.dow when 0 then 7 else cal.dow end;  -- lun..dom
$$;


create or replace function public.manager_pedidos_proximos()
returns table(
  contact_name_canon text,
  ultima_compra      date,
  cadencia_dias      numeric,
  proxima_esperada   date,
  dias_para          int,
  ventas_medias      numeric,
  prioridad          text   -- 'urgente' (vencido) | 'pronto' (3d) | 'esta_semana' (7d)
) language sql security invoker stable as $$
  with por_cliente as (
    select
      coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
      max(fecha)                                      as ultima,
      coalesce(sum(total), 0) / nullif(count(distinct id), 0)  as venta_media,
      case when count(distinct fecha) > 1
           then ((max(fecha) - min(fecha))::numeric / nullif(count(distinct fecha) - 1, 0))
           else null end                              as cadencia
    from public.manager_ventas_efectivas_canon
    where fecha >= current_date - 90
    group by 1
    having count(distinct id) >= 3
       and count(distinct fecha) >= 3
  )
  select
    contact_name_canon,
    ultima                                          as ultima_compra,
    round(cadencia, 1)                              as cadencia_dias,
    (ultima + (cadencia * interval '1 day'))::date  as proxima_esperada,
    ((ultima + (cadencia * interval '1 day'))::date - current_date)::int as dias_para,
    round(venta_media::numeric, 0)                  as ventas_medias,
    case
      when ((ultima + (cadencia * interval '1 day'))::date - current_date) < 0  then 'urgente'
      when ((ultima + (cadencia * interval '1 day'))::date - current_date) <= 3 then 'pronto'
      else 'esta_semana'
    end                                             as prioridad
  from por_cliente
  where ((ultima + (cadencia * interval '1 day'))::date - current_date) <= 7
    and (current_date - ultima) <= cadencia * 1.8 + 3   -- excluye los ya inactivos (van a dashboard)
  order by ((ultima + (cadencia * interval '1 day'))::date - current_date), venta_media desc;
$$;
