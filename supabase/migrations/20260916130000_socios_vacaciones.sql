create table public.socios_vacaciones (
  id uuid primary key default gen_random_uuid(),
  socio public.socio not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  created_at timestamptz not null default now(),
  constraint socios_vacaciones_fechas check (fecha_fin >= fecha_inicio)
);

create index socios_vacaciones_fechas_idx on public.socios_vacaciones (fecha_inicio, fecha_fin);
alter table public.socios_vacaciones enable row level security;
grant select, insert, update, delete on public.socios_vacaciones to authenticated;

create policy "socios_vacaciones: admin rw" on public.socios_vacaciones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "socios_vacaciones: responsable read" on public.socios_vacaciones
  for select to authenticated using (public.es_responsable());
