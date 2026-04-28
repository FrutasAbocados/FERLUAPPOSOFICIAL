-- ============================================================================
-- Trabajadores — extender empleados con datos laborales y pluses
-- ============================================================================

alter table public.empleados
  add column if not exists puesto              text,
  add column if not exists fecha_alta          date,
  add column if not exists sueldo_base         numeric(10,2),
  add column if not exists plus_transporte     numeric(10,2) default 0,
  add column if not exists plus_responsabilidad numeric(10,2) default 0,
  add column if not exists plus_otros          numeric(10,2) default 0,
  add column if not exists plus_otros_concepto text,
  add column if not exists notas               text,
  add column if not exists activo              boolean not null default true;

-- RLS: admin_full + admin_op pueden leer/escribir
alter table public.empleados enable row level security;
drop policy if exists "empleados: admin read" on public.empleados;
create policy "empleados: admin read"
  on public.empleados for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
    or user_id = auth.uid()
  );

drop policy if exists "empleados: admin write" on public.empleados;
create policy "empleados: admin write"
  on public.empleados for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  );
