-- ============================================================================
-- Sueldos socios — registro mensual de retiros de Luis y Álvaro
-- ============================================================================

do $$ begin
  create type public.socio as enum ('Luis', 'Álvaro');
exception when duplicate_object then null; end $$;

create table if not exists public.socios_retiros (
  id          uuid primary key default gen_random_uuid(),
  socio       public.socio not null,
  fecha       date not null,
  importe     numeric(10,2) not null check (importe > 0),
  concepto    text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists socios_retiros_fecha_idx  on public.socios_retiros (fecha desc);
create index if not exists socios_retiros_socio_idx  on public.socios_retiros (socio, fecha desc);

alter table public.socios_retiros enable row level security;
drop policy if exists "socios_retiros: admin all" on public.socios_retiros;
create policy "socios_retiros: admin all"
  on public.socios_retiros for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  );
