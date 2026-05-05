-- RPCs sesión 2 BBDD Clientes ficha 360°: evolución mensual + heatmap calendario + márgenes detallados

-- Evolución mensual del cliente: ventas, margen, docs por mes (últimos N meses)
drop function if exists public.manager_cliente_evolucion_mensual(text, int);
create or replace function public.manager_cliente_evolucion_mensual(
  p_contact_name_canon text,
  p_meses int default 12
)
returns table (
  mes_iso date, anio int, mes int, docs int,
  ventas numeric, cogs numeric, margen numeric, margen_pct numeric
)
language sql security invoker stable as $$
  with months as (
    select generate_series(
      (date_trunc('month', current_date) - make_interval(months => greatest(p_meses,1) - 1))::date,
      date_trunc('month', current_date)::date,
      interval '1 month'
    )::date as m
  ),
  cab as (
    select date_trunc('month', e.fecha)::date as mes_iso,
           count(distinct e.id)::int as docs,
           sum(e.total)::numeric as ventas
    from public.manager_ventas_efectivas_canon e
    where coalesce(e.contact_name_canon, '(sin contacto)') = p_contact_name_canon
      and e.fecha >= (date_trunc('month', current_date) - make_interval(months => greatest(p_meses,1) - 1))::date
    group by 1
  ),
  lin as (
    select date_trunc('month', l.fecha)::date as mes_iso,
           sum(l.subtotal)::numeric as ventas_subtotal,
           sum(l.cogs_linea)::numeric as cogs,
           sum(l.margen_linea)::numeric as margen
    from public.manager_lineas_efectivas l
    where coalesce(l.contact_name_canon, '(sin contacto)') = p_contact_name_canon
      and l.fecha >= (date_trunc('month', current_date) - make_interval(months => greatest(p_meses,1) - 1))::date
    group by 1
  )
  select months.m, extract(year from months.m)::int, extract(month from months.m)::int,
    coalesce(cab.docs,0), coalesce(cab.ventas,0), coalesce(lin.cogs,0), coalesce(lin.margen,0),
    case when coalesce(lin.ventas_subtotal,0) > 0 then round((lin.margen/lin.ventas_subtotal)*100,1) else null end
  from months
  left join cab on cab.mes_iso = months.m
  left join lin on lin.mes_iso = months.m
  order by months.m;
$$;

-- Heatmap calendario por día — un cliente
drop function if exists public.manager_cliente_heatmap_dia(text, date, date);
create or replace function public.manager_cliente_heatmap_dia(
  p_contact_name_canon text, p_from date, p_to date
)
returns table (fecha date, pedidos int, ventas numeric)
language sql security invoker stable as $$
  select e.fecha, count(distinct e.id)::int, sum(e.total)::numeric
  from public.manager_ventas_efectivas_canon e
  where coalesce(e.contact_name_canon,'(sin contacto)') = p_contact_name_canon
    and e.fecha between p_from and p_to
  group by e.fecha
  order by e.fecha;
$$;

-- Margen detalle: top productos cliente vs margen medio global del producto
drop function if exists public.manager_cliente_margen_detalle(text, date, date, int);
create or replace function public.manager_cliente_margen_detalle(
  p_contact_name_canon text, p_from date, p_to date, p_limit int default 20
)
returns table (
  product_id text, nombre text, unidades numeric, ventas_subtotal numeric,
  cogs numeric, margen numeric, margen_pct numeric, margen_pct_global numeric, delta_pp numeric
)
language sql security invoker stable as $$
  with cliente as (
    select l.product_id, l.nombre,
      sum(l.units)::numeric as unidades, sum(l.subtotal)::numeric as ventas_subtotal,
      sum(l.cogs_linea)::numeric as cogs, sum(l.margen_linea)::numeric as margen
    from public.manager_lineas_efectivas l
    where coalesce(l.contact_name_canon,'(sin contacto)') = p_contact_name_canon
      and l.fecha between p_from and p_to and l.product_id is not null
    group by l.product_id, l.nombre
    having sum(l.subtotal) > 0
  ),
  global_prod as (
    select l.product_id,
      sum(l.subtotal)::numeric as v_sub, sum(l.margen_linea)::numeric as v_mg
    from public.manager_lineas_efectivas l
    where l.fecha between p_from and p_to and l.product_id is not null
    group by l.product_id
    having sum(l.subtotal) > 0
  )
  select c.product_id, c.nombre, c.unidades, c.ventas_subtotal, c.cogs, c.margen,
    case when c.ventas_subtotal > 0 then round((c.margen/c.ventas_subtotal)*100,1) else null end,
    case when g.v_sub > 0 then round((g.v_mg/g.v_sub)*100,1) else null end,
    case when c.ventas_subtotal > 0 and g.v_sub > 0
         then round(((c.margen/c.ventas_subtotal) - (g.v_mg/g.v_sub))*100,1)
         else null end
  from cliente c
  left join global_prod g on g.product_id = c.product_id
  order by c.margen desc nulls last
  limit p_limit;
$$;

grant execute on function public.manager_cliente_evolucion_mensual(text, int) to authenticated;
grant execute on function public.manager_cliente_heatmap_dia(text, date, date) to authenticated;
grant execute on function public.manager_cliente_margen_detalle(text, date, date, int) to authenticated;
