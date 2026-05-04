-- ============================================================================
-- Trabajadores · Condiciones / Contratos (decisión 2026-05-04)
-- ============================================================================
-- Tabla 1-a-1 con empleados (UNIQUE empleado_id). Campos estructurados
-- modificables + texto libre. Vive en el módulo BBDD Trabajadores.
-- ============================================================================

create table if not exists public.trabajadores_condiciones (
  id                       uuid primary key default gen_random_uuid(),
  empleado_id              uuid not null unique references public.empleados(id) on delete cascade,
  jornada_horas_semana     int  check (jornada_horas_semana is null or jornada_horas_semana between 1 and 168),
  jornada_dias_semana      int  check (jornada_dias_semana  is null or jornada_dias_semana  between 1 and 7),
  horario_entrada          time,
  horario_salida           time,
  dias_descanso            text,                                              -- ej "domingo", "lunes y domingo"
  contrato_tipo            text check (contrato_tipo is null or contrato_tipo in ('indefinido','temporal','practicas','autonomo','otro')),
  fecha_inicio_contrato    date,
  fecha_fin_contrato       date,
  vacaciones_dias_anuales  int,
  texto_libre              text,                                               -- cláusulas adicionales, observaciones
  updated_by               uuid references auth.users(id) on delete set null,
  updated_at               timestamptz not null default now(),
  created_at               timestamptz not null default now()
);

create or replace function public.trab_cond_touch_updated() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trab_cond_touch on public.trabajadores_condiciones;
create trigger trab_cond_touch
  before update on public.trabajadores_condiciones
  for each row execute function public.trab_cond_touch_updated();

alter table public.trabajadores_condiciones enable row level security;

drop policy if exists "trab_cond: admin rw" on public.trabajadores_condiciones;
create policy "trab_cond: admin rw" on public.trabajadores_condiciones for all
  using  (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full','admin_op')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full','admin_op')));

drop policy if exists "trab_cond: empleado lee propio" on public.trabajadores_condiciones;
create policy "trab_cond: empleado lee propio" on public.trabajadores_condiciones for select
  using (exists (select 1 from public.empleados e where e.id = empleado_id and e.user_id = auth.uid()));

drop policy if exists "trab_cond: responsable read" on public.trabajadores_condiciones;
create policy "trab_cond: responsable read" on public.trabajadores_condiciones for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'responsable'));
