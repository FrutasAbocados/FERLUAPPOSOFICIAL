-- ============================================================================
-- Trabajadores — Vacaciones
-- ============================================================================
-- Pack 1 = 60 días anuales · Pack 2 = 48 días anuales (año natural).
-- Estados: pendiente → aprobado → disfrutado
-- Días = naturales (fecha_fin - fecha_inicio + 1) por simplicidad.
-- ============================================================================

create table if not exists public.trabajadores_vacaciones (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid not null references public.empleados(id) on delete cascade,
  fecha_inicio  date not null,
  fecha_fin     date not null,
  dias          int  generated always as ((fecha_fin - fecha_inicio) + 1) stored,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente', 'aprobado', 'disfrutado')),
  nota          text,
  creado_por    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint trab_vac_rango_valido check (fecha_fin >= fecha_inicio)
);

create index if not exists trab_vac_empleado_idx
  on public.trabajadores_vacaciones (empleado_id, fecha_inicio desc);

-- updated_at auto
create or replace function public.trab_vac_touch_updated() returns trigger
language plpgsql security definer as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trab_vac_touch on public.trabajadores_vacaciones;
create trigger trab_vac_touch
  before update on public.trabajadores_vacaciones
  for each row execute function public.trab_vac_touch_updated();

-- RLS — admin_full + admin_op
alter table public.trabajadores_vacaciones enable row level security;

drop policy if exists "vacaciones: admin rw" on public.trabajadores_vacaciones;
create policy "vacaciones: admin rw"
  on public.trabajadores_vacaciones for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  );

-- Empleados pueden ver SUS propios periodos
drop policy if exists "vacaciones: empleado read propio" on public.trabajadores_vacaciones;
create policy "vacaciones: empleado read propio"
  on public.trabajadores_vacaciones for select
  using (
    exists (select 1 from public.empleados e where e.id = empleado_id and e.user_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- RPC: resumen anual por empleado (días totales / disfrutados / aprobados / pendientes / restantes)
-- ---------------------------------------------------------------------------
create or replace function public.trabajadores_vacaciones_resumen_anual(p_anio int default null)
returns table (
  empleado_id   uuid,
  nombre        text,
  pack          smallint,
  dias_anuales  int,
  disfrutados   bigint,
  aprobados     bigint,
  pendientes    bigint,
  restantes     int
)
language sql security invoker stable as $$
  with anio as (
    select coalesce(p_anio, extract(year from current_date)::int) as y
  ),
  agg as (
    select
      v.empleado_id,
      sum(case when v.estado = 'disfrutado' then v.dias else 0 end)::bigint as disfrutados,
      sum(case when v.estado = 'aprobado'   then v.dias else 0 end)::bigint as aprobados,
      sum(case when v.estado = 'pendiente'  then v.dias else 0 end)::bigint as pendientes
    from public.trabajadores_vacaciones v, anio a
    where extract(year from v.fecha_inicio) = a.y
    group by v.empleado_id
  )
  select
    e.id,
    e.nombre,
    e.pack,
    case when e.pack = 1 then 60 else 48 end as dias_anuales,
    coalesce(g.disfrutados, 0) as disfrutados,
    coalesce(g.aprobados,   0) as aprobados,
    coalesce(g.pendientes,  0) as pendientes,
    (case when e.pack = 1 then 60 else 48 end
       - coalesce(g.disfrutados, 0)::int
       - coalesce(g.aprobados,   0)::int) as restantes
  from public.empleados e
  left join agg g on g.empleado_id = e.id
  where e.activo = true
  order by e.nombre;
$$;
