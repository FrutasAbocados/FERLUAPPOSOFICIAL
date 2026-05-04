-- ============================================================================
-- Trabajadores · Festivos 2026 + auto-resta de vacaciones
-- ============================================================================
-- Catálogo hardcoded de festivos (Nacional + Andalucía + Málaga). El admin
-- marca por trabajador si lo trabajó o no. Si NO lo trabajó → -2 días de
-- vacaciones automáticamente. Si no hay registro, no se descuenta nada
-- (sólo cuentan los explícitamente marcados como `trabajado = false`).
--
-- Aplica a ambos packs (Pack 1 y Pack 2), decisión usuario 2026-05-04.
-- ============================================================================

-- 1) Catálogo de festivos
create table if not exists public.trabajadores_festivos_catalogo (
  fecha   date primary key,
  nombre  text not null,
  ambito  text not null check (ambito in ('nacional','andalucia','malaga'))
);

-- Seed festivos 2026 (Málaga)
insert into public.trabajadores_festivos_catalogo (fecha, nombre, ambito) values
  ('2026-01-01', 'Año Nuevo',                       'nacional'),
  ('2026-01-06', 'Reyes',                           'nacional'),
  ('2026-02-28', 'Día de Andalucía',                'andalucia'),
  ('2026-04-02', 'Jueves Santo',                    'nacional'),
  ('2026-04-03', 'Viernes Santo',                   'nacional'),
  ('2026-05-01', 'Día del Trabajo',                 'nacional'),
  ('2026-08-15', 'Asunción de la Virgen',           'nacional'),
  ('2026-08-19', 'Incorporación Reyes Católicos',   'malaga'),
  ('2026-09-08', 'Virgen de la Victoria',           'malaga'),
  ('2026-10-12', 'Fiesta Nacional',                 'nacional'),
  ('2026-11-01', 'Todos los Santos',                'nacional'),
  ('2026-12-06', 'Constitución',                    'nacional'),
  ('2026-12-08', 'Inmaculada',                      'nacional'),
  ('2026-12-25', 'Navidad',                         'nacional')
on conflict (fecha) do nothing;

-- RLS: lectura para todos los autenticados
alter table public.trabajadores_festivos_catalogo enable row level security;
drop policy if exists "festivos_catalogo: read all" on public.trabajadores_festivos_catalogo;
create policy "festivos_catalogo: read all" on public.trabajadores_festivos_catalogo
  for select using (auth.uid() is not null);


-- 2) Marcado por trabajador
create table if not exists public.trabajadores_festivos_marcados (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  fecha        date not null references public.trabajadores_festivos_catalogo(fecha) on delete cascade,
  trabajado    boolean not null,
  notas        text,
  marcado_por  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (empleado_id, fecha)
);

create index if not exists trab_fest_marc_emp_idx
  on public.trabajadores_festivos_marcados (empleado_id, fecha);

create or replace function public.trab_fest_touch_updated() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trab_fest_touch on public.trabajadores_festivos_marcados;
create trigger trab_fest_touch
  before update on public.trabajadores_festivos_marcados
  for each row execute function public.trab_fest_touch_updated();

alter table public.trabajadores_festivos_marcados enable row level security;

drop policy if exists "festivos_marc: admin rw" on public.trabajadores_festivos_marcados;
create policy "festivos_marc: admin rw" on public.trabajadores_festivos_marcados for all
  using  (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full','admin_op')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full','admin_op')));

drop policy if exists "festivos_marc: empleado lee propio" on public.trabajadores_festivos_marcados;
create policy "festivos_marc: empleado lee propio" on public.trabajadores_festivos_marcados for select
  using (exists (select 1 from public.empleados e where e.id = empleado_id and e.user_id = auth.uid()));

drop policy if exists "festivos_marc: responsable read" on public.trabajadores_festivos_marcados;
create policy "festivos_marc: responsable read" on public.trabajadores_festivos_marcados for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'responsable'));


-- 3) RPC vacaciones — ampliada con auto-resta de festivos no trabajados
drop function if exists public.trabajadores_vacaciones_resumen_anual(integer);
create or replace function public.trabajadores_vacaciones_resumen_anual(p_anio integer default null)
returns table (
  empleado_id              uuid,
  nombre                   text,
  pack                     smallint,
  dias_anuales             integer,
  festivos_no_trabajados   integer,
  dias_descontados_festivos integer,
  dias_anuales_efectivos   integer,
  disfrutados              bigint,
  aprobados                bigint,
  pendientes               bigint,
  restantes                integer
)
language sql stable as $$
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
      case e.pack when 1 then 60 when 2 then 48 else 0 end as dias_anuales
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
$$;


-- 4) RPC para la UI: lista de festivos del año con marcado por empleado
drop function if exists public.trabajadores_festivos_lista_anio(integer);
create or replace function public.trabajadores_festivos_lista_anio(p_anio integer default null)
returns table (
  fecha           date,
  nombre          text,
  ambito          text,
  empleado_id     uuid,
  empleado_nombre text,
  trabajado       boolean,
  notas           text,
  marca_id        uuid
)
language sql security invoker stable as $$
  with anio as (
    select coalesce(p_anio, extract(year from current_date)::int) as y
  ),
  fc as (
    select c.fecha, c.nombre, c.ambito
    from public.trabajadores_festivos_catalogo c
    cross join anio a
    where extract(year from c.fecha) = a.y
  )
  select
    fc.fecha, fc.nombre, fc.ambito,
    e.id as empleado_id, e.nombre as empleado_nombre,
    m.trabajado, m.notas, m.id as marca_id
  from fc
  cross join public.empleados e
  left join public.trabajadores_festivos_marcados m
    on m.empleado_id = e.id and m.fecha = fc.fecha
  where e.activo = true
  order by fc.fecha asc, e.nombre asc;
$$;

grant execute on function public.trabajadores_vacaciones_resumen_anual(integer) to authenticated;
grant execute on function public.trabajadores_festivos_lista_anio(integer)      to authenticated;
