-- ============================================================================
-- Trabajadores — Puntos diarios + canje mensual a €
-- ============================================================================
-- Solo pack 1. Álvaro puntúa cada día 0-2 en 3 categorías:
--   puntualidad / reparto / responsabilidad
-- Total diario máx = 6. Mes laborable real máx ≈ 25 días → tope 150 pts.
--
-- Canje mensual a € (curva cóncava: fácil 50€, difícil 100€):
--   < 30 pts        → 0€
--   30 pts          → 50€
--   150 pts (techo) → 100€
--   intermedio      → 50 + 50 * sqrt((pts - 30) / 120)
-- ============================================================================

create table if not exists public.trabajadores_puntos_dias (
  id              uuid primary key default gen_random_uuid(),
  empleado_id     uuid not null references public.empleados(id) on delete cascade,
  fecha           date not null,
  puntualidad     smallint not null default 0 check (puntualidad     between 0 and 2),
  reparto         smallint not null default 0 check (reparto         between 0 and 2),
  responsabilidad smallint not null default 0 check (responsabilidad between 0 and 2),
  total           smallint generated always as (puntualidad + reparto + responsabilidad) stored,
  nota            text,
  creado_por      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (empleado_id, fecha)
);

create index if not exists trab_pts_empleado_fecha_idx
  on public.trabajadores_puntos_dias (empleado_id, fecha desc);
create index if not exists trab_pts_fecha_idx
  on public.trabajadores_puntos_dias (fecha desc);

create or replace function public.trab_pts_touch_updated() returns trigger
language plpgsql security definer as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trab_pts_touch on public.trabajadores_puntos_dias;
create trigger trab_pts_touch
  before update on public.trabajadores_puntos_dias
  for each row execute function public.trab_pts_touch_updated();


-- ---------------------------------------------------------------------------
-- RLS — admin rw + empleado lee propios
-- ---------------------------------------------------------------------------
alter table public.trabajadores_puntos_dias enable row level security;

drop policy if exists "puntos: admin rw" on public.trabajadores_puntos_dias;
create policy "puntos: admin rw"
  on public.trabajadores_puntos_dias for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  );

drop policy if exists "puntos: empleado lee propio" on public.trabajadores_puntos_dias;
create policy "puntos: empleado lee propio"
  on public.trabajadores_puntos_dias for select
  using (
    exists (select 1 from public.empleados e where e.id = empleado_id and e.user_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- Función curva puntos → euros (fácil 50€, difícil 100€)
-- ---------------------------------------------------------------------------
create or replace function public.trab_pts_a_euros(p_puntos int)
returns numeric language sql immutable as $$
  select case
    when p_puntos is null or p_puntos < 30 then 0::numeric
    when p_puntos >= 150 then 100::numeric
    else round((50 + 50 * sqrt((p_puntos - 30)::numeric / 120))::numeric, 2)
  end;
$$;


-- ---------------------------------------------------------------------------
-- RPC: filas para el editor diario (grid empleados pack 1 × 3 categorías)
--    Devuelve TODOS los empleados pack 1, con sus puntos del día (0 si no).
-- ---------------------------------------------------------------------------
create or replace function public.trabajadores_puntos_dia(p_fecha date default current_date)
returns table (
  empleado_id     uuid,
  nombre          text,
  fila_id         uuid,
  puntualidad     smallint,
  reparto         smallint,
  responsabilidad smallint,
  total           smallint,
  nota            text
)
language sql security invoker stable as $$
  select
    e.id,
    e.nombre,
    d.id as fila_id,
    coalesce(d.puntualidad, 0)::smallint     as puntualidad,
    coalesce(d.reparto, 0)::smallint         as reparto,
    coalesce(d.responsabilidad, 0)::smallint as responsabilidad,
    coalesce(d.total, 0)::smallint           as total,
    d.nota
  from public.empleados e
  left join public.trabajadores_puntos_dias d
    on d.empleado_id = e.id and d.fecha = p_fecha
  where e.activo = true and e.pack = 1
  order by e.nombre;
$$;


-- ---------------------------------------------------------------------------
-- RPC: resumen mensual (puntos totales + € canjeado por empleado)
-- ---------------------------------------------------------------------------
create or replace function public.trabajadores_puntos_resumen_mes(p_mes date default current_date)
returns table (
  empleado_id           uuid,
  nombre                text,
  dias_puntuados        bigint,
  total_puntos          bigint,
  pts_puntualidad       bigint,
  pts_reparto           bigint,
  pts_responsabilidad   bigint,
  euros                 numeric
)
language sql security invoker stable as $$
  with rng as (
    select
      date_trunc('month', p_mes)::date as inicio,
      (date_trunc('month', p_mes) + interval '1 month')::date as fin
  )
  select
    e.id,
    e.nombre,
    count(d.id)                                                  as dias_puntuados,
    coalesce(sum(d.total), 0)                                    as total_puntos,
    coalesce(sum(d.puntualidad), 0)                              as pts_puntualidad,
    coalesce(sum(d.reparto), 0)                                  as pts_reparto,
    coalesce(sum(d.responsabilidad), 0)                          as pts_responsabilidad,
    public.trab_pts_a_euros(coalesce(sum(d.total), 0)::int)      as euros
  from public.empleados e
  left join public.trabajadores_puntos_dias d
    on d.empleado_id = e.id
   and d.fecha >= (select inicio from rng)
   and d.fecha <  (select fin    from rng)
  where e.activo = true and e.pack = 1
  group by e.id, e.nombre
  order by e.nombre;
$$;


-- ---------------------------------------------------------------------------
-- RPC: detalle diario de un empleado en un mes (para histórico)
-- ---------------------------------------------------------------------------
create or replace function public.trabajadores_puntos_detalle_mes(
  p_empleado_id uuid,
  p_mes         date default current_date
)
returns table (
  fecha           date,
  puntualidad     smallint,
  reparto         smallint,
  responsabilidad smallint,
  total           smallint,
  nota            text
)
language sql security invoker stable as $$
  with rng as (
    select
      date_trunc('month', p_mes)::date as inicio,
      (date_trunc('month', p_mes) + interval '1 month')::date as fin
  )
  select d.fecha, d.puntualidad, d.reparto, d.responsabilidad, d.total, d.nota
  from public.trabajadores_puntos_dias d, rng
  where d.empleado_id = p_empleado_id
    and d.fecha >= rng.inicio and d.fecha < rng.fin
  order by d.fecha;
$$;
