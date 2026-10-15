-- El resumen reutiliza una sola resolución de costes para KPIs, serie y tops.
-- Conserva las RPC anteriores para otros consumidores y para poder revertir.
create or replace function public.manager_resumen_dashboard(p_from date, p_to date)
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  with ventas as materialized (
    select id, fecha, total, subtipo,
           coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon
    from public.manager_ventas_efectivas_canon
    where fecha between p_from - (p_to - p_from + 1) and p_to
      and (select public.puede_ver_manager())
  ), compras as materialized (
    select fecha, total
    from public.manager_facturas
    where tipo = 'COMPRA'
      and fecha between p_from - (p_to - p_from + 1) and p_to
      and (select public.puede_ver_manager())
  ), lineas as materialized (
    select fecha, nombre, product_id, contact_name_canon,
           units, total_linea, subtotal, subtotal_con_coste, cogs_linea, margen_linea
    from public.manager_lineas_efectivas
    where fecha between p_from - (p_to - p_from + 1) and p_to
      and (select public.puede_ver_manager())
  ), v as (
    select coalesce(sum(total) filter (where fecha >= p_from), 0) as ventas,
           coalesce(sum(total) filter (where fecha < p_from), 0) as ventas_ant,
           coalesce(sum(total) filter (where fecha >= p_from and subtipo = 'waybill'), 0) as pendiente_cobro,
           count(distinct id) filter (where fecha >= p_from) as docs
    from ventas
  ), c as (
    select coalesce(sum(total) filter (where fecha >= p_from), 0) as compras,
           coalesce(sum(total) filter (where fecha < p_from), 0) as compras_ant
    from compras
  ), m as (
    select coalesce(sum(margen_linea) filter (where fecha >= p_from), 0) as margen,
           coalesce(sum(margen_linea) filter (where fecha < p_from), 0) as margen_ant,
           coalesce(sum(cogs_linea) filter (where fecha >= p_from), 0) as cogs,
           coalesce(sum(subtotal_con_coste) filter (where fecha >= p_from), 0) as ventas_con_coste
    from lineas
  ), resumen as (
    select v.ventas, v.ventas_ant,
           case when v.ventas_ant > 0 then round((v.ventas - v.ventas_ant) / v.ventas_ant * 100, 1) end as ventas_delta_pct,
           c.compras, c.compras_ant,
           case when c.compras_ant > 0 then round((c.compras - c.compras_ant) / c.compras_ant * 100, 1) end as compras_delta_pct,
           m.margen, m.margen_ant,
           case when m.margen_ant != 0 then round((m.margen - m.margen_ant) / abs(m.margen_ant) * 100, 1) end as margen_delta_pct,
           v.pendiente_cobro, v.docs, m.cogs,
           case when m.ventas_con_coste > 0 then round(m.margen / m.ventas_con_coste * 100, 1) end as margen_pct,
           p_from - (p_to - p_from + 1) as comp_from, p_from - 1 as comp_to
    from v, c, m
  ), vd as (
    select fecha, sum(total) as ventas from ventas where fecha >= p_from group by fecha
  ), cd as (
    select fecha, sum(total) as compras from compras where fecha >= p_from group by fecha
  ), md as (
    select fecha, sum(margen_linea) as margen from lineas where fecha >= p_from group by fecha
  ), serie as (
    select d::date as fecha, coalesce(vd.ventas, 0) as ventas,
           coalesce(cd.compras, 0) as compras, coalesce(md.margen, 0) as margen
    from generate_series(p_from, p_to, '1 day'::interval) d
    left join vd on vd.fecha = d::date
    left join cd on cd.fecha = d::date
    left join md on md.fecha = d::date
  ), cab as (
    select contact_name_canon, count(distinct id) as docs, coalesce(sum(total), 0) as ventas
    from ventas where fecha >= p_from group by contact_name_canon
  ), lin as (
    select coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
           coalesce(sum(units), 0) as unidades, coalesce(sum(subtotal), 0) as ventas_subtotal,
           coalesce(sum(subtotal_con_coste), 0) as ventas_con_coste,
           coalesce(sum(cogs_linea), 0) as cogs, coalesce(sum(margen_linea), 0) as margen
    from lineas where fecha >= p_from group by 1
  ), top_clientes as (
    select cab.contact_name_canon, cab.docs, coalesce(lin.unidades, 0) as unidades,
           cab.ventas, coalesce(lin.ventas_subtotal, 0) as ventas_subtotal,
           coalesce(lin.cogs, 0) as cogs, coalesce(lin.margen, 0) as margen,
           case when lin.ventas_con_coste > 0 then round(lin.margen / lin.ventas_con_coste * 100, 1) end as margen_pct
    from cab left join lin using (contact_name_canon)
    order by coalesce(lin.margen, 0) desc nulls last, cab.contact_name_canon
    limit 10
  ), top_productos as (
    select mode() within group (order by coalesce(nullif(trim(nombre), ''), '(sin nombre)')) as nombre,
           max(product_id) as product_id, coalesce(sum(units), 0) as unidades,
           coalesce(sum(total_linea), 0) as ventas, coalesce(sum(subtotal), 0) as ventas_subtotal,
           coalesce(sum(cogs_linea), 0) as cogs, coalesce(sum(margen_linea), 0) as margen,
           case when sum(subtotal_con_coste) > 0 then round(sum(margen_linea) / sum(subtotal_con_coste) * 100, 1) end as margen_pct
    from lineas where fecha >= p_from
    group by public.manager_norm_nombre(coalesce(nullif(trim(nombre), ''), '(sin nombre)'))
    order by margen desc nulls last, nombre
    limit 10
  )
  select jsonb_build_object(
    'resumen', (select to_jsonb(r) from resumen r),
    'serie', coalesce((select jsonb_agg(to_jsonb(s) order by s.fecha) from serie s), '[]'::jsonb),
    'top_clientes', coalesce((select jsonb_agg(to_jsonb(t) order by t.margen desc, t.contact_name_canon) from top_clientes t), '[]'::jsonb),
    'top_productos', coalesce((select jsonb_agg(to_jsonb(t) order by t.margen desc, t.nombre) from top_productos t), '[]'::jsonb)
  )
  -- La guarda exterior evita devolver un resumen vacío a usuarios sin permiso.
  where (select public.puede_ver_manager());
$function$;

revoke all on function public.manager_resumen_dashboard(date, date) from public, anon;
grant execute on function public.manager_resumen_dashboard(date, date) to authenticated, service_role;
