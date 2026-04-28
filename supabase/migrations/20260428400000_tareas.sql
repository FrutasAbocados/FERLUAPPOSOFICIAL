-- ============================================================================
-- Abocados OS — Módulo Tareas
-- ============================================================================
-- Lista de tareas operativas que gestionan los admins (Luis + Álvaro).
-- Cada tarea tiene título, descripción, prioridad, estado, vencimiento y
-- puede asignarse a un empleado para tracking interno (los empleados no
-- acceden al módulo en esta versión — el front bloquea la ruta).
--
-- RLS: admin (full+op) R/W; empleados sin acceso (no policy).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tarea_estado') then
    create type public.tarea_estado as enum ('pendiente', 'en_progreso', 'hecha', 'cancelada');
  end if;
  if not exists (select 1 from pg_type where typname = 'tarea_prioridad') then
    create type public.tarea_prioridad as enum ('baja', 'media', 'alta');
  end if;
end$$;

create table if not exists public.tareas (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null,
  descripcion         text,
  estado              public.tarea_estado not null default 'pendiente',
  prioridad           public.tarea_prioridad not null default 'media',
  asignado_a          uuid references public.empleados(id) on delete set null,
  categoria           text,
  fecha_vencimiento   date,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists idx_tareas_estado on public.tareas(estado);
create index if not exists idx_tareas_asignado on public.tareas(asignado_a);
create index if not exists idx_tareas_venc on public.tareas(fecha_vencimiento);

drop trigger if exists trg_tareas_updated_at on public.tareas;
create trigger trg_tareas_updated_at
  before update on public.tareas
  for each row execute function public.touch_updated_at();

-- Trigger: auto-set/clear completed_at cuando cambia estado a/desde 'hecha'
create or replace function public.tareas_completed_at_sync()
returns trigger language plpgsql as $$
begin
  if new.estado = 'hecha' and (old.estado is distinct from 'hecha') then
    new.completed_at := now();
  elsif new.estado <> 'hecha' and old.estado = 'hecha' then
    new.completed_at := null;
  end if;
  return new;
end$$;

drop trigger if exists trg_tareas_completed_at on public.tareas;
create trigger trg_tareas_completed_at
  before update on public.tareas
  for each row execute function public.tareas_completed_at_sync();

-- Y para INSERT con estado='hecha' directamente
create or replace function public.tareas_completed_at_insert()
returns trigger language plpgsql as $$
begin
  if new.estado = 'hecha' and new.completed_at is null then
    new.completed_at := now();
  end if;
  return new;
end$$;

drop trigger if exists trg_tareas_completed_at_ins on public.tareas;
create trigger trg_tareas_completed_at_ins
  before insert on public.tareas
  for each row execute function public.tareas_completed_at_insert();

-- RLS
alter table public.tareas enable row level security;

drop policy if exists "tareas: admin R/W" on public.tareas;
create policy "tareas: admin R/W"
  on public.tareas for all
  using (public.is_admin())
  with check (public.is_admin());
