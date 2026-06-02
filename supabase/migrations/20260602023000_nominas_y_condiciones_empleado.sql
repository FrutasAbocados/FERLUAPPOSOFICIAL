-- ─────────────────────────────────────────────────────────────
-- Nóminas (PDF subido por admin, descargado por empleado)
-- + RPCs read-only para que el empleado vea LO SUYO
-- (Condiciones reutiliza tablas existentes: empleados + trabajadores_condiciones)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.trabajadores_nominas (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  periodo      date not null,                      -- primer día del mes (2026-05-01)
  titulo       text,                               -- override opcional ("Paga extra")
  storage_path text not null,                      -- '{empleado_id}/{uuid}.pdf'
  size_bytes   bigint,
  mime_type    text not null default 'application/pdf',
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create index if not exists trabajadores_nominas_emp_periodo_idx
  on public.trabajadores_nominas (empleado_id, periodo desc);

alter table public.trabajadores_nominas enable row level security;

drop policy if exists "trabajadores_nominas: admin rw" on public.trabajadores_nominas;
create policy "trabajadores_nominas: admin rw" on public.trabajadores_nominas
  for all using (is_admin()) with check (is_admin());

drop policy if exists "trabajadores_nominas: empleado lee propio" on public.trabajadores_nominas;
create policy "trabajadores_nominas: empleado lee propio" on public.trabajadores_nominas
  for select using (
    empleado_id in (select e.id from public.empleados e where e.user_id = auth.uid())
  );

drop policy if exists "trabajadores_nominas: responsable read" on public.trabajadores_nominas;
create policy "trabajadores_nominas: responsable read" on public.trabajadores_nominas
  for select using (es_responsable());

-- ── Bucket privado de nóminas ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nominas', 'nominas', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Storage RLS: is_admin() falla silencioso en storage → check inline por profiles
drop policy if exists "nominas: admin all" on storage.objects;
create policy "nominas: admin all" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'nominas'
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('admin_full','admin_op'))
  )
  with check (
    bucket_id = 'nominas'
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('admin_full','admin_op'))
  );

drop policy if exists "nominas: empleado lee propio" on storage.objects;
create policy "nominas: empleado lee propio" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'nominas'
    and (storage.foldername(name))[1] in (
      select e.id::text from public.empleados e where e.user_id = auth.uid()
    )
  );

-- ── RPC: condiciones del propio empleado (read-only) ──
create or replace function public.mis_condiciones()
returns table (
  empleado_id           uuid,
  nombre                text,
  puesto                text,
  fecha_alta            date,
  sueldo_base           numeric,
  plus_transporte       numeric,
  plus_responsabilidad  numeric,
  plus_otros            numeric,
  plus_otros_concepto   text,
  jornada_horas_semana  integer,
  jornada_dias_semana   integer,
  horario_entrada       time,
  horario_salida        time,
  dias_descanso         text,
  contrato_tipo         text,
  fecha_inicio_contrato date,
  fecha_fin_contrato    date,
  vacaciones_dias_anuales integer,
  texto_libre           text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    e.id, e.nombre, e.puesto, e.fecha_alta,
    e.sueldo_base, e.plus_transporte, e.plus_responsabilidad,
    e.plus_otros, e.plus_otros_concepto,
    c.jornada_horas_semana, c.jornada_dias_semana,
    c.horario_entrada, c.horario_salida, c.dias_descanso,
    c.contrato_tipo, c.fecha_inicio_contrato, c.fecha_fin_contrato,
    c.vacaciones_dias_anuales, c.texto_libre
  from public.empleados e
  left join public.trabajadores_condiciones c on c.empleado_id = e.id
  where e.user_id = auth.uid() and e.activo
  limit 1
$$;

-- ── RPC: nóminas del propio empleado (read-only) ──
create or replace function public.mis_nominas()
returns table (
  id           uuid,
  periodo      date,
  titulo       text,
  storage_path text,
  size_bytes   bigint,
  created_at   timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select n.id, n.periodo, n.titulo, n.storage_path, n.size_bytes, n.created_at
  from public.trabajadores_nominas n
  join public.empleados e on e.id = n.empleado_id
  where e.user_id = auth.uid()
  order by n.periodo desc
$$;

revoke execute on function public.mis_condiciones() from anon;
revoke execute on function public.mis_nominas() from anon;
grant  execute on function public.mis_condiciones() to authenticated;
grant  execute on function public.mis_nominas() to authenticated;
