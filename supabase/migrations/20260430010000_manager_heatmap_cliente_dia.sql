-- ============================================================================
-- Manager — RPC manager_heatmap_cliente_dia()
-- ============================================================================
-- Devuelve, para los top N clientes (ventas en el periodo), el desglose
-- por día de la semana ISO (1=lun..7=dom). Frontend renderiza la matriz
-- cliente × día con intensidad de color por importe en Patrones.
-- ============================================================================

create or replace function public.manager_heatmap_cliente_dia(
  p_from date, p_to date, p_top int default 30
)
returns table(
  contact_name_canon text,
  ventas_total       numeric,
  dow                int,    -- 1=lun .. 7=dom (ISO)
  dia                text,
  pedidos            int,
  ventas             numeric
) language sql security invoker stable as $$
  with por_cliente as (
    select
      coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
      sum(total)                                     as ventas_total
    from public.manager_ventas_efectivas_canon
    where fecha between p_from and p_to
    group by 1
  ),
  top_clientes as (
    select contact_name_canon, ventas_total
    from por_cliente
    order by ventas_total desc nulls last
    limit p_top
  ),
  por_dow as (
    select
      coalesce(v.contact_name_canon, '(sin contacto)') as contact_name_canon,
      extract(isodow from v.fecha)::int                as dow,
      count(distinct v.id)                             as pedidos,
      sum(v.total)                                     as ventas
    from public.manager_ventas_efectivas_canon v
    where v.fecha between p_from and p_to
    group by 1, 2
  )
  select
    t.contact_name_canon,
    t.ventas_total,
    p.dow,
    case p.dow
      when 1 then 'Lun' when 2 then 'Mar' when 3 then 'Mié'
      when 4 then 'Jue' when 5 then 'Vie' when 6 then 'Sáb'
      else 'Dom'
    end::text                                          as dia,
    p.pedidos::int,
    p.ventas
  from top_clientes t
  join por_dow p on p.contact_name_canon = t.contact_name_canon
  order by t.ventas_total desc, p.dow;
$$;
