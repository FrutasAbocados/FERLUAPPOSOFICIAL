-- ============================================================================
-- Manager — aliases de clientes + override de costes manuales
-- ============================================================================
-- manager_clientes_alias: normaliza grafías distintas del mismo cliente.
--   alias_from = nombre tal cual aparece en Holded (raw)
--   alias_to   = nombre canónico
-- manager_costes_manuales: override del coste calculado para un product_id.
--   coste_eur prevalece sobre el coste calculado por la vista.
-- Ambas: solo admin_full lee/escribe.
-- ============================================================================

create table if not exists public.manager_clientes_alias (
  id          uuid primary key default gen_random_uuid(),
  alias_from  text not null unique,
  alias_to    text not null,
  created_at  timestamptz not null default now()
);

create index if not exists manager_clientes_alias_to_idx on public.manager_clientes_alias (alias_to);

create table if not exists public.manager_costes_manuales (
  product_id  text primary key,
  coste_eur   numeric(12,4) not null,
  nota        text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.manager_clientes_alias  enable row level security;
alter table public.manager_costes_manuales enable row level security;

drop policy if exists "manager: admin_full alias all" on public.manager_clientes_alias;
create policy "manager: admin_full alias all"
  on public.manager_clientes_alias for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full')
  );

drop policy if exists "manager: admin_full costes all" on public.manager_costes_manuales;
create policy "manager: admin_full costes all"
  on public.manager_costes_manuales for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full')
  );
