-- Algunos empleados tienen un cupo anual cerrado que no se reduce por festivos
-- no trabajados (Alex Ruiz: 30 días al año sin contar festivos).

alter table public.empleados
  add column if not exists vacaciones_descuenta_festivos boolean not null default true;

update public.empleados
set vacaciones_descuenta_festivos = false
where id = '32358d74-5166-4c15-8bb0-07e1e27f8a94'; -- Alex Ruiz

create or replace function public.trabajadores_vacaciones_resumen_anual(p_anio integer default null::integer)
 returns table(empleado_id uuid, nombre text, pack smallint, dias_anuales integer, festivos_no_trabajados integer, dias_descontados_festivos integer, dias_anuales_efectivos integer, disfrutados bigint, aprobados bigint, pendientes bigint, restantes integer)
 language sql
 stable
 set search_path to 'public'
as $function$
  with anio as (
    select coalesce(p_anio, extract(year from current_date)::int) as y
  ),
  agg as (
    select
      v.empleado_id,
      sum(case when v.estado = 'disfrutado' then v.dias else 0 end)::bigint as disfrutados,
      sum(case when v.estado = 'aprobado'   then v.dias else 0 end)::bigint as aprobados,
      sum(case when v.estado = 'pendiente'  then v.dias else 0 end)::bigint as pendientes
    from public.trabajadores_vacaciones v
    cross join anio a
    where extract(year from v.fecha_inicio) = a.y
    group by v.empleado_id
  ),
  fest as (
    select
      m.empleado_id,
      count(*)::int as festivos_no_trabajados
    from public.trabajadores_festivos_marcados m
    cross join anio a
    where extract(year from m.fecha) = a.y
      and m.trabajado = false
    group by m.empleado_id
  ),
  cfg as (
    select
      e.id,
      e.nombre,
      e.pack,
      e.vacaciones_descuenta_festivos,
      coalesce(
        c.dias_anuales,
        round(
          (case e.pack when 1 then 60 when 2 then 48 else 0 end)
          * coalesce(e.jornada_factor, 1)
        )::int
      ) as dias_anuales
    from public.empleados e
    cross join anio a
    left join public.trabajadores_vacaciones_cupos_anuales c
      on c.empleado_id = e.id
     and c.anio = a.y
    where e.activo = true
  ),
  calc as (
    select
      c.*,
      case when c.vacaciones_descuenta_festivos
           then coalesce(f.festivos_no_trabajados, 0) else 0 end as fest_n
    from cfg c
    left join fest f on f.empleado_id = c.id
  )
  select
    c.id,
    c.nombre,
    c.pack,
    c.dias_anuales,
    c.fest_n                                                          as festivos_no_trabajados,
    c.fest_n * 2                                                      as dias_descontados_festivos,
    (c.dias_anuales - c.fest_n * 2)                                   as dias_anuales_efectivos,
    coalesce(g.disfrutados, 0)                                        as disfrutados,
    coalesce(g.aprobados,   0)                                        as aprobados,
    coalesce(g.pendientes,  0)                                        as pendientes,
    (c.dias_anuales
      - c.fest_n * 2
      - coalesce(g.disfrutados, 0)::int
      - coalesce(g.aprobados,   0)::int)                              as restantes
  from calc c
  left join agg g on g.empleado_id = c.id
  order by c.nombre;
$function$;
