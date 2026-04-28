-- ============================================================================
-- Abocados OS — Módulo Turnos: empleados + turnos
-- ============================================================================
-- Schema mínimo para arrancar el módulo Turnos.
--   - empleados: ficha de cada trabajador. Puede estar enlazada o no a un
--     usuario de auth (los 5 trabajadores tendrán cuenta, pero la tabla acepta
--     empleados sin login para flexibilidad).
--   - turnos: una fila por empleado/día con un tipo de turno. Lo edita un
--     admin; los empleados solo leen.
--
-- RLS:
--   - empleados: admins R/W; empleados pueden leer la ficha de quien sea
--   - turnos:    admins R/W; empleados leen solo sus propios turnos
-- ============================================================================

-- 1. Tipo enum de tipos de turno (alineado con la app vieja Turnos)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'shift_type') then
    create type public.shift_type as enum ('compra', 'manana', 'libre', 'power');
  end if;
end$$;

-- 2. Tabla empleados
create table if not exists public.empleados (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null,
  nombre      text not null,
  alias       text,
  color       text,
  activo      boolean not null default true,
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_empleados_updated_at on public.empleados;
create trigger trg_empleados_updated_at
  before update on public.empleados
  for each row execute function public.touch_updated_at();

create index if not exists idx_empleados_user on public.empleados(user_id);

-- 3. Tabla turnos
create table if not exists public.turnos (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  fecha        date not null,
  tipo         public.shift_type not null,
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (empleado_id, fecha)
);

drop trigger if exists trg_turnos_updated_at on public.turnos;
create trigger trg_turnos_updated_at
  before update on public.turnos
  for each row execute function public.touch_updated_at();

create index if not exists idx_turnos_fecha on public.turnos(fecha);
create index if not exists idx_turnos_empleado on public.turnos(empleado_id);

-- 4. RLS empleados
alter table public.empleados enable row level security;

drop policy if exists "empleados: leer todos (auth)" on public.empleados;
create policy "empleados: leer todos (auth)"
  on public.empleados for select
  using (auth.role() = 'authenticated');

drop policy if exists "empleados: admin R/W" on public.empleados;
create policy "empleados: admin R/W"
  on public.empleados for all
  using (public.is_admin())
  with check (public.is_admin());

-- 5. RLS turnos
alter table public.turnos enable row level security;

drop policy if exists "turnos: empleado lee sus propios" on public.turnos;
create policy "turnos: empleado lee sus propios"
  on public.turnos for select
  using (
    public.is_admin()
    or empleado_id in (select id from public.empleados where user_id = auth.uid())
  );

drop policy if exists "turnos: admin R/W" on public.turnos;
create policy "turnos: admin R/W"
  on public.turnos for all
  using (public.is_admin())
  with check (public.is_admin());
