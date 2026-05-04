-- ============================================================================
-- Trabajadores · Puntos rework (decisiones 2026-05-04)
-- ============================================================================
--   1. Notas por categoría (puntualidad / reparto / responsabilidad).
--      Sustituyen la antigua `nota` global, que se deja por compat (la usa
--      el trigger de notificaciones).
--   2. Curva trab_pts_a_euros sustituida por sistema escalonado:
--        <100 pts → 0€   ·   100-120 → 50€
--        120-140 → 100€  ·   ≥140    → 150€
--   3. Nueva tabla trabajadores_puntos_ajustes para que admin sume/reste
--      puntos a un día concreto con motivo.
--   4. RPCs `_resumen_mes` y `_dia` ampliadas para reflejar lo anterior.
-- ============================================================================

-- 1) Notas por categoría
alter table public.trabajadores_puntos_dias
  add column if not exists nota_puntualidad     text,
  add column if not exists nota_reparto         text,
  add column if not exists nota_responsabilidad text;


-- 2) Curva → sistema escalonado
create or replace function public.trab_pts_a_euros(p_puntos int)
returns numeric language sql immutable as $$
  select case
    when p_puntos is null or p_puntos < 100 then 0::numeric
    when p_puntos < 120 then  50::numeric
    when p_puntos < 140 then 100::numeric
    else 150::numeric
  end;
$$;


-- 3) Tabla de ajustes manuales (admin suma/resta a un día concreto)
create table if not exists public.trabajadores_puntos_ajustes (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  fecha        date not null,
  delta_pts    smallint not null check (delta_pts <> 0 and delta_pts between -10 and 10),
  motivo       text not null check (length(trim(motivo)) > 0),
  creado_por   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists trab_pts_ajustes_emp_fecha_idx
  on public.trabajadores_puntos_ajustes (empleado_id, fecha desc);
create index if not exists trab_pts_ajustes_fecha_idx
  on public.trabajadores_puntos_ajustes (fecha desc);

alter table public.trabajadores_puntos_ajustes enable row level security;

drop policy if exists "puntos_ajustes: admin rw" on public.trabajadores_puntos_ajustes;
create policy "puntos_ajustes: admin rw"
  on public.trabajadores_puntos_ajustes for all
  using  (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full','admin_op')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full','admin_op')));

drop policy if exists "puntos_ajustes: empleado lee propio" on public.trabajadores_puntos_ajustes;
create policy "puntos_ajustes: empleado lee propio"
  on public.trabajadores_puntos_ajustes for select
  using (exists (select 1 from public.empleados e where e.id = empleado_id and e.user_id = auth.uid()));

drop policy if exists "puntos_ajustes: responsable read" on public.trabajadores_puntos_ajustes;
create policy "puntos_ajustes: responsable read"
  on public.trabajadores_puntos_ajustes for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'responsable'));


-- 4a) RPC editor diario — añade las 3 notas por categoría
drop function if exists public.trabajadores_puntos_dia(date);
create or replace function public.trabajadores_puntos_dia(p_fecha date default current_date)
returns table (
  empleado_id          uuid,
  nombre               text,
  fila_id              uuid,
  puntualidad          smallint,
  reparto              smallint,
  responsabilidad      smallint,
  total                smallint,
  nota_puntualidad     text,
  nota_reparto         text,
  nota_responsabilidad text
)
language sql security invoker stable as $$
  select
    e.id,
    e.nombre,
    d.id                                       as fila_id,
    coalesce(d.puntualidad,     0)::smallint   as puntualidad,
    coalesce(d.reparto,         0)::smallint   as reparto,
    coalesce(d.responsabilidad, 0)::smallint   as responsabilidad,
    coalesce(d.total,           0)::smallint   as total,
    d.nota_puntualidad,
    d.nota_reparto,
    d.nota_responsabilidad
  from public.empleados e
  left join public.trabajadores_puntos_dias d
    on d.empleado_id = e.id and d.fecha = p_fecha
  where e.activo = true and e.pack = 1
  order by e.nombre;
$$;


-- 4b) Resumen mensual — base + ajustes + euros sobre el total efectivo
drop function if exists public.trabajadores_puntos_resumen_mes(date);
create or replace function public.trabajadores_puntos_resumen_mes(p_mes date default current_date)
returns table (
  empleado_id           uuid,
  nombre                text,
  dias_puntuados        bigint,
  pts_base              bigint,
  pts_ajustes           bigint,
  total_puntos          bigint,
  pts_puntualidad       bigint,
  pts_reparto           bigint,
  pts_responsabilidad   bigint,
  euros                 numeric
)
language sql security invoker stable as $$
  with rng as (
    select
      date_trunc('month', p_mes)::date                            as inicio,
      (date_trunc('month', p_mes) + interval '1 month')::date     as fin
  ),
  base as (
    select
      e.id  as empleado_id,
      e.nombre,
      count(d.id)                                                 as dias_puntuados,
      coalesce(sum(d.total),           0)::bigint                 as pts_base,
      coalesce(sum(d.puntualidad),     0)::bigint                 as pts_puntualidad,
      coalesce(sum(d.reparto),         0)::bigint                 as pts_reparto,
      coalesce(sum(d.responsabilidad), 0)::bigint                 as pts_responsabilidad
    from public.empleados e
    left join public.trabajadores_puntos_dias d
      on d.empleado_id = e.id
     and d.fecha >= (select inicio from rng)
     and d.fecha <  (select fin    from rng)
    where e.activo = true and e.pack = 1
    group by e.id, e.nombre
  ),
  ajustes as (
    select
      a.empleado_id,
      coalesce(sum(a.delta_pts), 0)::bigint as pts_ajustes
    from public.trabajadores_puntos_ajustes a, rng
    where a.fecha >= rng.inicio and a.fecha < rng.fin
    group by a.empleado_id
  )
  select
    b.empleado_id,
    b.nombre,
    b.dias_puntuados,
    b.pts_base,
    coalesce(aj.pts_ajustes, 0)                              as pts_ajustes,
    (b.pts_base + coalesce(aj.pts_ajustes, 0))               as total_puntos,
    b.pts_puntualidad,
    b.pts_reparto,
    b.pts_responsabilidad,
    public.trab_pts_a_euros((b.pts_base + coalesce(aj.pts_ajustes, 0))::int) as euros
  from base b
  left join ajustes aj on aj.empleado_id = b.empleado_id
  order by b.nombre;
$$;


-- 4c) Detalle mensual — devuelve los días normales con notas por categoría
drop function if exists public.trabajadores_puntos_detalle_mes(uuid, date);
create or replace function public.trabajadores_puntos_detalle_mes(
  p_empleado_id uuid,
  p_mes         date default current_date
)
returns table (
  fecha                date,
  puntualidad          smallint,
  reparto              smallint,
  responsabilidad      smallint,
  total                smallint,
  nota_puntualidad     text,
  nota_reparto         text,
  nota_responsabilidad text
)
language sql security invoker stable as $$
  with rng as (
    select
      date_trunc('month', p_mes)::date as inicio,
      (date_trunc('month', p_mes) + interval '1 month')::date as fin
  )
  select d.fecha, d.puntualidad, d.reparto, d.responsabilidad, d.total,
         d.nota_puntualidad, d.nota_reparto, d.nota_responsabilidad
  from public.trabajadores_puntos_dias d, rng
  where d.empleado_id = p_empleado_id
    and d.fecha >= rng.inicio and d.fecha < rng.fin
  order by d.fecha;
$$;


-- 4d) Ajustes mensuales por empleado (para mostrar lista en el detalle)
create or replace function public.trabajadores_puntos_ajustes_mes(
  p_empleado_id uuid,
  p_mes         date default current_date
)
returns table (
  id          uuid,
  fecha       date,
  delta_pts   smallint,
  motivo      text,
  creado_por  uuid,
  created_at  timestamptz
)
language sql security invoker stable as $$
  with rng as (
    select
      date_trunc('month', p_mes)::date as inicio,
      (date_trunc('month', p_mes) + interval '1 month')::date as fin
  )
  select a.id, a.fecha, a.delta_pts, a.motivo, a.creado_por, a.created_at
  from public.trabajadores_puntos_ajustes a, rng
  where a.empleado_id = p_empleado_id
    and a.fecha >= rng.inicio and a.fecha < rng.fin
  order by a.fecha desc, a.created_at desc;
$$;

grant execute on function public.trabajadores_puntos_ajustes_mes(uuid, date) to authenticated;
