-- manager_resumen_comparativo: 1,26 s -> 0,32 s como admin, mismo resultado.
-- Antes cruzaba cada CTE con `ranges`, asi que las fechas no llegaban como
-- constantes al indice, y recorria manager_lineas_efectivas dos veces (periodo
-- actual y anterior). Ahora usa los parametros directos y una sola pasada con
-- FILTER. Verificado byte a byte contra la version anterior (30 dias y un trimestre).

create or replace function public.manager_resumen_comparativo(p_from date, p_to date)
returns table(ventas numeric, ventas_ant numeric, ventas_delta_pct numeric, compras numeric, compras_ant numeric, compras_delta_pct numeric, margen numeric, margen_ant numeric, margen_delta_pct numeric, pendiente_cobro numeric, docs bigint, cogs numeric, margen_pct numeric, comp_from date, comp_to date)
language sql
stable security definer
set search_path to 'public'
as $function$
  with v_act as (
    select coalesce(sum(e.total), 0) as ventas,
           coalesce(sum(case when e.subtipo='waybill' then e.total else 0 end), 0) as pendiente,
           count(distinct e.id) as docs
    from public.manager_ventas_efectivas e
    where e.fecha between p_from and p_to and public.puede_ver_manager()
  ),
  v_ant as (
    select coalesce(sum(e.total), 0) as ventas
    from public.manager_ventas_efectivas e
    where e.fecha between p_from - (p_to - p_from + 1) and p_from - 1 and public.puede_ver_manager()
  ),
  c_act as (
    select coalesce(sum(total), 0) as compras
    from public.manager_facturas
    where tipo = 'COMPRA' and fecha between p_from and p_to and public.puede_ver_manager()
  ),
  c_ant as (
    select coalesce(sum(total), 0) as compras
    from public.manager_facturas
    where tipo = 'COMPRA' and fecha between p_from - (p_to - p_from + 1) and p_from - 1 and public.puede_ver_manager()
  ),
  m as (
    select coalesce(sum(margen_linea) filter (where fecha >= p_from), 0)       as margen,
           coalesce(sum(cogs_linea) filter (where fecha >= p_from), 0)         as cogs,
           coalesce(sum(subtotal_con_coste) filter (where fecha >= p_from), 0) as ventas_con_coste,
           coalesce(sum(margen_linea) filter (where fecha < p_from), 0)        as margen_ant
    from public.manager_lineas_efectivas
    where fecha between p_from - (p_to - p_from + 1) and p_to and public.puede_ver_manager()
  )
  select v_act.ventas, v_ant.ventas,
    case when v_ant.ventas > 0 then round(((v_act.ventas - v_ant.ventas) / v_ant.ventas) * 100, 1) else null end,
    c_act.compras, c_ant.compras,
    case when c_ant.compras > 0 then round(((c_act.compras - c_ant.compras) / c_ant.compras) * 100, 1) else null end,
    m.margen, m.margen_ant,
    case when m.margen_ant != 0 then round(((m.margen - m.margen_ant) / abs(m.margen_ant)) * 100, 1) else null end,
    v_act.pendiente, v_act.docs, m.cogs,
    case when m.ventas_con_coste > 0 then round((m.margen / m.ventas_con_coste) * 100, 1) else null end,
    p_from - (p_to - p_from + 1), p_from - 1
  from v_act, v_ant, c_act, c_ant, m;
$function$;
