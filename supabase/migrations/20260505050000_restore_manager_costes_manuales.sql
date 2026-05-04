-- ============================================================================
-- HOTFIX 2026-05-05 · Restaurar tabla manager_costes_manuales (audit error)
-- ============================================================================
-- La tabla se dropeó por error en 20260505030000 — el auditor la marcó como
-- zombi pero la usa el módulo Manager (`useCosteManual` en queries.ts:394).
-- Consecuencia: el Manager rompía en producción.
-- Aquí se recrea con su schema y policies originales (de 20260428640000 +
-- 20260429150000 + 20260429192000).
-- ============================================================================

create table if not exists public.manager_costes_manuales (
  product_id  text primary key,
  coste_eur   numeric(12,4) not null,
  nota        text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.manager_costes_manuales enable row level security;

drop policy if exists "manager: admin_full costes all" on public.manager_costes_manuales;
create policy "manager: admin_full costes all"
  on public.manager_costes_manuales for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full')
  );

drop policy if exists "manager: responsable read costes" on public.manager_costes_manuales;
create policy "manager: responsable read costes"
  on public.manager_costes_manuales for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'responsable')
  );

drop policy if exists "manager: admin_op rw costes_manuales" on public.manager_costes_manuales;
create policy "manager: admin_op rw costes_manuales"
  on public.manager_costes_manuales for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op')
  );
