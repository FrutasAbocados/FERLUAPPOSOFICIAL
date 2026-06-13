-- Media jornada / factor de jornada por empleado.
-- Las vacaciones (pack 1=60d, pack 2=48d) se prorratean por este factor.
-- 1 = jornada completa · 0,5 = media jornada (p.ej. Alex Ruiz, 4 h/día).
-- Los pluses NO se tocan (ya se fijan a mano por empleado).

alter table public.empleados
  add column if not exists jornada_factor numeric not null default 1;

do $do$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'empleados_jornada_factor_chk'
  ) then
    alter table public.empleados
      add constraint empleados_jornada_factor_chk
      check (jornada_factor > 0 and jornada_factor <= 1);
  end if;
end
$do$;

-- Alex Ruiz: media jornada.
update public.empleados
set jornada_factor = 0.5
where id = '32358d74-5166-4c15-8bb0-07e1e27f8a94';

-- RPC: prorratear días anuales de vacaciones por el factor de jornada.
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
    select e.id, e.nombre, e.pack,
      round(
        (case e.pack when 1 then 60 when 2 then 48 else 0 end)
        * coalesce(e.jornada_factor, 1)
      )::int as dias_anuales
    from public.empleados e
    where e.activo = true
  )
  select
    c.id,
    c.nombre,
    c.pack,
    c.dias_anuales,
    coalesce(f.festivos_no_trabajados, 0)                             as festivos_no_trabajados,
    coalesce(f.festivos_no_trabajados, 0) * 2                         as dias_descontados_festivos,
    (c.dias_anuales - coalesce(f.festivos_no_trabajados, 0) * 2)      as dias_anuales_efectivos,
    coalesce(g.disfrutados, 0)                                        as disfrutados,
    coalesce(g.aprobados,   0)                                        as aprobados,
    coalesce(g.pendientes,  0)                                        as pendientes,
    (c.dias_anuales
      - coalesce(f.festivos_no_trabajados, 0) * 2
      - coalesce(g.disfrutados, 0)::int
      - coalesce(g.aprobados,   0)::int)                              as restantes
  from cfg c
  left join agg  g on g.empleado_id = c.id
  left join fest f on f.empleado_id = c.id
  order by c.nombre;
$function$;
