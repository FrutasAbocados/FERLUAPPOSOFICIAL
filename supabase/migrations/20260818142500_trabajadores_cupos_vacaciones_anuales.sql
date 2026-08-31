-- Cupos de vacaciones excepcionales por empleado y año.
-- Permite prorrateos de alta sin reducir el cupo de años posteriores.

create table if not exists public.trabajadores_vacaciones_cupos_anuales (
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  anio         integer not null check (anio between 2000 and 2100),
  dias_anuales integer not null check (dias_anuales between 0 and 366),
  nota         text,
  updated_at   timestamptz not null default now(),
  primary key (empleado_id, anio)
);

alter table public.trabajadores_vacaciones_cupos_anuales enable row level security;

drop policy if exists "vacaciones_cupos: admin rw" on public.trabajadores_vacaciones_cupos_anuales;
create policy "vacaciones_cupos: admin rw"
  on public.trabajadores_vacaciones_cupos_anuales for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "vacaciones_cupos: responsable read" on public.trabajadores_vacaciones_cupos_anuales;
create policy "vacaciones_cupos: responsable read"
  on public.trabajadores_vacaciones_cupos_anuales for select
  using (public.es_responsable());

drop policy if exists "vacaciones_cupos: empleado lee propio" on public.trabajadores_vacaciones_cupos_anuales;
create policy "vacaciones_cupos: empleado lee propio"
  on public.trabajadores_vacaciones_cupos_anuales for select
  using (
    exists (
      select 1
      from public.empleados e
      where e.id = trabajadores_vacaciones_cupos_anuales.empleado_id
        and e.user_id = auth.uid()
        and e.activo = true
    )
  );

grant select, insert, update, delete
  on public.trabajadores_vacaciones_cupos_anuales
  to authenticated;

insert into public.trabajadores_vacaciones_cupos_anuales (
  empleado_id,
  anio,
  dias_anuales,
  nota
)
select
  e.id,
  2026,
  30,
  'Prorrateo por alta en junio de 2026'
from public.empleados e
where e.nombre = 'Alvaro Gomez'
on conflict (empleado_id, anio) do update
set dias_anuales = excluded.dias_anuales,
    nota = excluded.nota,
    updated_at = now();

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

grant execute on function public.trabajadores_vacaciones_resumen_anual(integer)
  to authenticated;
