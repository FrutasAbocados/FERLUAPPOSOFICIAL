-- Rendimiento y fugas detectadas en la auditoria del 2026-09-23.
--
-- 1. Guardas de rol evaluadas una vez por consulta, no por fila.
--    ~290 policies llamaban a is_admin()/puede_ver_manager()/... sin envolver.
--    Postgres las evaluaba por fila y cada llamada baja por
--    puede_ver_manager -> is_admin -> current_role (lee profiles), sin inlining
--    por el SET search_path. dashboard_productos_anomalos y dashboard_pvp_sugerido
--    agotaban el statement_timeout (500 en el Dashboard) y manager_resumen_periodo
--    tardaba ~1,1 s como admin. Con `(select fn())` Postgres lo resuelve como
--    InitPlan: mismo resultado (las funciones son STABLE y no dependen de la fila).
--    Solo se reescriben llamadas sin argumentos; las ya envueltas quedan igual.
--
-- 2. manager_ventas_efectivas vuelve a security_invoker. La recreo
--    20260912194749 con `create or replace view` y perdio la opcion que puso
--    20260727090000: cualquier empleado con sesion leia todas las ventas por REST.
--
-- 3. manager_resumen_comparativo, manager_serie_diaria y manager_forecast_proximo_mes
--    (SECURITY DEFINER) solo guardaban una de sus CTE: un empleado obtenia compras,
--    margen, COGS y ventas mensuales. Ahora cada lectura lleva la guarda.
--
-- 4. dashboard_pvp_sugerido y dashboard_productos_anomalos (SECURITY INVOKER) seguian
--    tardando 6,5 s y 3,7 s como admin aun con (1): bajo RLS Postgres no puede
--    empujar filtros no leakproof (lower/trim de los alias) por debajo de la barrera
--    de seguridad. Pasan al patron del resto de RPC del Manager: SECURITY DEFINER
--    con puede_ver_manager() en cada lectura (sin permiso de Manager no devuelven
--    nada, antes devolvian ventas sin coste). pvp_sugerido ademas acota la CTE de
--    compras, que se materializaba entera, a greatest(p_dias, 90) dias.

-- 1 ---------------------------------------------------------------------------
do $$
declare
  r  record;
  re text;
  s  text;
begin
  -- Todos los helpers de rol: funciones publicas sin argumentos, booleanas y
  -- STABLE/IMMUTABLE (is_admin, es_responsable, puede_ver_clientes, ...).
  select '(^|[^A-Za-z_.])(' || string_agg(p.proname, '|') || ')\(\)'
    into re
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.pronargs = 0
    and p.prorettype = 'bool'::regtype
    and p.provolatile in ('s', 'i');

  for r in
    select * from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ re
  loop
    s := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if r.qual is not null then
      s := s || format(' using (%s)', regexp_replace(r.qual, re, '\1(select public.\2())', 'g'));
    end if;
    if r.with_check is not null then
      s := s || format(' with check (%s)', regexp_replace(r.with_check, re, '\1(select public.\2())', 'g'));
    end if;
    execute s;
  end loop;
end $$;

-- 2 ---------------------------------------------------------------------------
alter view public.manager_ventas_efectivas set (security_invoker = true);

-- 3 ---------------------------------------------------------------------------
create or replace function public.manager_resumen_comparativo(p_from date, p_to date)
returns table(ventas numeric, ventas_ant numeric, ventas_delta_pct numeric, compras numeric, compras_ant numeric, compras_delta_pct numeric, margen numeric, margen_ant numeric, margen_delta_pct numeric, pendiente_cobro numeric, docs bigint, cogs numeric, margen_pct numeric, comp_from date, comp_to date)
language sql
stable security definer
set search_path to 'public'
as $function$
  with span as (
    select (p_to - p_from + 1)::int as ndias
  ),
  ranges as (
    select
      p_from                                     as actual_from,
      p_to                                       as actual_to,
      (p_from - (select ndias from span))::date  as ant_from,
      (p_from - 1)::date                         as ant_to
  ),
  v_act as (
    select
      coalesce(sum(e.total), 0)                                               as ventas,
      coalesce(sum(case when e.subtipo='waybill' then e.total else 0 end), 0) as pendiente,
      count(distinct e.id)                                                    as docs
    from public.manager_ventas_efectivas e, ranges r
    where e.fecha between r.actual_from and r.actual_to
      and public.puede_ver_manager()
  ),
  v_ant as (
    select coalesce(sum(e.total), 0) as ventas
    from public.manager_ventas_efectivas e, ranges r
    where e.fecha between r.ant_from and r.ant_to
      and public.puede_ver_manager()
  ),
  c_act as (
    select coalesce(sum(total), 0) as compras
    from public.manager_facturas, ranges r
    where tipo = 'COMPRA' and fecha between r.actual_from and r.actual_to
      and public.puede_ver_manager()
  ),
  c_ant as (
    select coalesce(sum(total), 0) as compras
    from public.manager_facturas, ranges r
    where tipo = 'COMPRA' and fecha between r.ant_from and r.ant_to
      and public.puede_ver_manager()
  ),
  m_act as (
    select coalesce(sum(margen_linea), 0)       as margen,
           coalesce(sum(cogs_linea), 0)         as cogs,
           coalesce(sum(subtotal_con_coste), 0) as ventas_con_coste
    from public.manager_lineas_efectivas, ranges r
    where fecha between r.actual_from and r.actual_to
      and public.puede_ver_manager()
  ),
  m_ant as (
    select coalesce(sum(margen_linea), 0) as margen
    from public.manager_lineas_efectivas, ranges r
    where fecha between r.ant_from and r.ant_to
      and public.puede_ver_manager()
  )
  select
    v_act.ventas, v_ant.ventas,
    case when v_ant.ventas > 0
         then round(((v_act.ventas - v_ant.ventas) / v_ant.ventas) * 100, 1)
         else null end,
    c_act.compras, c_ant.compras,
    case when c_ant.compras > 0
         then round(((c_act.compras - c_ant.compras) / c_ant.compras) * 100, 1)
         else null end,
    m_act.margen, m_ant.margen,
    case when m_ant.margen != 0
         then round(((m_act.margen - m_ant.margen) / abs(m_ant.margen)) * 100, 1)
         else null end,
    v_act.pendiente,
    v_act.docs,
    m_act.cogs,
    case when m_act.ventas_con_coste > 0
         then round((m_act.margen / m_act.ventas_con_coste) * 100, 1)
         else null end,
    r.ant_from, r.ant_to
  from v_act, v_ant, c_act, c_ant, m_act, m_ant, ranges r;
$function$;

create or replace function public.manager_serie_diaria(p_from date, p_to date)
returns table(fecha date, ventas numeric, compras numeric, margen numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
  with v as (
    select fecha, coalesce(sum(total), 0) as ventas
    from public.manager_ventas_efectivas
    where fecha between p_from and p_to
      and public.puede_ver_manager()
    group by 1
  ),
  c as (
    select fecha, coalesce(sum(total), 0) as compras
    from public.manager_facturas
    where tipo = 'COMPRA' and fecha between p_from and p_to
      and public.puede_ver_manager()
    group by 1
  ),
  m as (
    select fecha, coalesce(sum(margen_linea), 0) as margen
    from public.manager_lineas_efectivas
    where fecha between p_from and p_to
      and public.puede_ver_manager()
    group by 1
  )
  select d::date,
         coalesce(v.ventas, 0),
         coalesce(c.compras, 0),
         coalesce(m.margen, 0)
  from generate_series(p_from, p_to, '1 day'::interval) d
  left join v on v.fecha = d::date
  left join c on c.fecha = d::date
  left join m on m.fecha = d::date
  order by d;
$function$;

create or replace function public.manager_forecast_proximo_mes()
returns table(mes_proximo date, forecast_next numeric, mes_actual_proy numeric, pct_mes numeric, tendencia_pct numeric, base_meses integer, meses_serie jsonb)
language sql
stable security definer
set search_path to 'public'
as $function$
  with mes_actual as (
    select
      coalesce(sum(total), 0) as ventas_mtd,
      extract(day from current_date)::int as dia_actual,
      extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::int as dia_total
    from public.manager_ventas_efectivas
    where fecha >= date_trunc('month', current_date)
      and fecha <= current_date
      and public.puede_ver_manager()
  ),
  mes_actual_proy as (
    select
      ventas_mtd,
      case when dia_actual > 0 then ventas_mtd * dia_total / dia_actual else 0 end as proy,
      round(dia_actual * 100.0 / dia_total, 1) as pct
    from mes_actual
  ),
  meses_completos as (
    select date_trunc('month', fecha)::date as mes, sum(total) as ventas
    from public.manager_ventas_efectivas
    where fecha < date_trunc('month', current_date)
      and public.puede_ver_manager()
    group by 1
    order by 1
  ),
  ratios as (
    select ventas, lag(ventas) over (order by mes) as prev
    from meses_completos
  ),
  tendencia as (
    select
      least(0.25, greatest(-0.25, coalesce(avg(ventas / nullif(prev, 0)) - 1, 0))) as capeada,
      count(*) filter (where prev is not null and prev > 0) as n
    from ratios
  ),
  serie as (
    select mes, ventas::numeric as ventas, false as es_proy from meses_completos
    union all
    select date_trunc('month', current_date)::date,
           (select proy from mes_actual_proy)::numeric, true
    union all
    select (date_trunc('month', current_date) + interval '1 month')::date,
           ((select proy from mes_actual_proy) * (1 + (select capeada from tendencia)))::numeric, true
    union all
    select (date_trunc('month', current_date) + interval '2 month')::date,
           ((select proy from mes_actual_proy) * power(1 + (select capeada from tendencia), 2))::numeric, true
    union all
    select (date_trunc('month', current_date) + interval '3 month')::date,
           ((select proy from mes_actual_proy) * power(1 + (select capeada from tendencia), 3))::numeric, true
  )
  select
    (date_trunc('month', current_date) + interval '1 month')::date as mes_proximo,
    round((select proy from mes_actual_proy) * (1 + (select capeada from tendencia)), 0) as forecast_next,
    round((select proy from mes_actual_proy), 0) as mes_actual_proy,
    (select pct from mes_actual_proy) as pct_mes,
    round((select capeada from tendencia) * 100, 1) as tendencia_pct,
    (select n from tendencia)::int as base_meses,
    (select jsonb_agg(jsonb_build_object('mes', mes, 'ventas', round(ventas), 'es_proy', es_proy) order by mes)
     from serie) as meses_serie;
$function$;

-- 4 ---------------------------------------------------------------------------
create or replace function public.dashboard_pvp_sugerido(
  p_dias integer default 14,
  p_pct_min numeric default 15,
  p_margen_objetivo_pct numeric default 25
)
returns table(product_id text, nombre text, coste_actual numeric, coste_anterior numeric, coste_variacion_pct numeric, pvp_actual numeric, pvp_sugerido numeric, margen_actual_pct numeric, delta_pvp_pct numeric, ultimas_ventas_dias integer, ultima_compra date)
language sql
stable security definer
set search_path to 'public'
as $function$
  with compras as (
    select
      r.product_id_resuelto as product_id,
      coalesce(p.nombre, r.nombre) as nombre,
      r.fecha,
      r.unidades_producto as units,
      r.importe_coste as subtotal
    from public.manager_lineas_producto_resueltas r
    left join lateral (
      select ph.holded_product_name as nombre
      from public.pedidos_wa_productos_holded ph
      where ph.holded_product_id = r.product_id_resuelto
      order by case when ph.source = 'manual' then 0 else 1 end, ph.updated_at desc
      limit 1
    ) p on true
    where r.tipo = 'COMPRA'
      and r.product_id_resuelto is not null
      and r.unidades_producto > 0
      and r.importe_coste > 0
      -- Unica ventana que consumen coste_recien y coste_antes.
      and r.fecha >= current_date - greatest(p_dias, 90)
      and public.puede_ver_manager()
  ),
  coste_recien as (
    select
      product_id,
      max(nombre) as nombre,
      sum(subtotal) / nullif(sum(units), 0) as coste,
      max(fecha) as ult
    from compras
    where fecha >= current_date - p_dias
    group by product_id
  ),
  coste_antes as (
    select
      product_id,
      sum(subtotal) / nullif(sum(units), 0) as coste
    from compras
    where fecha >= current_date - 90
      and fecha < current_date - p_dias
    group by product_id
    having count(*) >= 2
  ),
  pvp_recien as (
    select
      r.product_id_resuelto as product_id,
      sum(r.subtotal) / nullif(sum(r.units), 0) as pvp,
      count(distinct r.fecha)::integer as dias_con_venta
    from public.manager_lineas_producto_resueltas r
    join public.manager_ventas_efectivas e on e.id = r.factura_id
    where r.product_id_resuelto is not null
      and r.units > 0
      and r.subtotal > 0
      and r.fecha >= current_date - 30
      and public.puede_ver_manager()
    group by r.product_id_resuelto
  )
  select
    r.product_id,
    r.nombre,
    r.coste::numeric(12,4),
    a.coste::numeric(12,4),
    round(((r.coste - a.coste) / a.coste) * 100, 1),
    p.pvp::numeric(12,4),
    round((r.coste / (1 - (p_margen_objetivo_pct / 100)))::numeric, 2),
    case when p.pvp > 0
      then round(((p.pvp - r.coste) / p.pvp) * 100, 1)
      else null
    end,
    case when p.pvp > 0
      then round((((r.coste / (1 - (p_margen_objetivo_pct / 100))) - p.pvp) / p.pvp) * 100, 1)
      else null
    end,
    coalesce(p.dias_con_venta, 0),
    r.ult
  from coste_recien r
  join coste_antes a using (product_id)
  left join pvp_recien p using (product_id)
  where a.coste > 0
    and ((r.coste - a.coste) / a.coste) * 100 >= p_pct_min
  order by ((r.coste - a.coste) / a.coste) * 100 desc
  limit 30;
$function$;

create or replace function public.dashboard_productos_anomalos(p_dias integer default 30)
returns table(product_id text, nombre text, unidades numeric, ventas numeric, margen numeric, margen_pct numeric, motivo text)
language sql
stable security definer
set search_path to 'public'
as $function$
  with agg as (
    select
      max(product_id)                                    as product_id,
      coalesce(nullif(trim(nombre), ''), '(sin nombre)') as nombre,
      coalesce(sum(units), 0)        as unidades,
      coalesce(sum(subtotal), 0)     as ventas,
      coalesce(sum(subtotal_con_coste), 0) as ventas_con_coste,
      coalesce(sum(margen_linea), 0) as margen,
      bool_and(coste_unidad is null) as todas_sin_coste
    from public.manager_lineas_efectivas
    where fecha >= current_date - p_dias
      and public.puede_ver_manager()
    group by coalesce(nullif(trim(nombre), ''), '(sin nombre)')
    having coalesce(sum(subtotal), 0) > 50
  )
  select
    product_id, nombre, unidades, ventas, margen,
    round((margen / nullif(ventas_con_coste, 0)) * 100, 1) as margen_pct,
    case
      when todas_sin_coste then 'sin_coste'
      when (margen / nullif(ventas_con_coste, 0)) * 100 < 5  then 'margen_bajo'
      when (margen / nullif(ventas_con_coste, 0)) * 100 > 70 then 'margen_excesivo'
      else null
    end as motivo
  from agg
  where todas_sin_coste
     or (margen / nullif(ventas_con_coste, 0)) * 100 < 5
     or (margen / nullif(ventas_con_coste, 0)) * 100 > 70
  order by ventas desc
  limit 30;
$function$;

-- Solo usuarios con sesion; las SECURITY DEFINER nuevas no se exponen a anon.
revoke execute on function public.dashboard_pvp_sugerido(integer, numeric, numeric) from public, anon;
revoke execute on function public.dashboard_productos_anomalos(integer) from public, anon;
grant execute on function public.dashboard_pvp_sugerido(integer, numeric, numeric) to authenticated;
grant execute on function public.dashboard_productos_anomalos(integer) to authenticated;
