-- Coach privado para trabajadores de AbocadosOS.
-- El contenido no tiene policy de lectura para administradores o responsables.

create table if not exists public.people_coach_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references public.empleados(id) on delete cascade,
  consent_version text not null,
  consent_text text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, consent_version)
);

create table if not exists public.people_coach_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references public.empleados(id) on delete cascade,
  session_type text not null default 'need_to_talk'
    check (session_type in ('initial_interview', 'need_to_talk', 'weekly_check_in')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'processing', 'completed', 'failed')),
  started_at timestamptz,
  ended_at timestamptz,
  private_summary jsonb not null default '{}'::jsonb,
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 3600),
  api_usage jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric(10, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  transcript_storage_enabled boolean not null default false
    check (transcript_storage_enabled = false),
  prompt_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.people_coach_shares (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.people_coach_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references public.empleados(id) on delete cascade,
  shared_summary jsonb not null,
  consent_version text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists people_coach_sessions_owner_recent_idx
  on public.people_coach_sessions (user_id, created_at desc);

drop trigger if exists trg_people_coach_sessions_updated_at on public.people_coach_sessions;
create trigger trg_people_coach_sessions_updated_at
  before update on public.people_coach_sessions
  for each row execute function public.touch_updated_at();

alter table public.people_coach_consents enable row level security;
alter table public.people_coach_sessions enable row level security;
alter table public.people_coach_shares enable row level security;

create policy "people consent: trabajador lee propio"
  on public.people_coach_consents for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.empleados e
      where e.id = employee_id and e.user_id = auth.uid() and e.activo
    )
  );

create policy "people sessions: trabajador lee propio"
  on public.people_coach_sessions for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.empleados e
      where e.id = employee_id and e.user_id = auth.uid() and e.activo
    )
  );

create policy "people shares: trabajador lee lo compartido"
  on public.people_coach_shares for select
  to authenticated
  using (user_id = auth.uid());

create policy "people shares: admin lee lo aprobado"
  on public.people_coach_shares for select
  to authenticated
  using (public.is_admin() and revoked_at is null);

comment on table public.people_coach_sessions is
  'Sesiones privadas del coach. Sin audio ni transcript persistidos y sin acceso RLS para responsables/admins.';
comment on column public.people_coach_sessions.private_summary is
  'Síntesis privada visible exclusivamente para el trabajador propietario mediante RLS.';
comment on table public.people_coach_shares is
  'Resumen operativo separado, anunciado y consentido antes de iniciar; nunca contiene transcript ni resumen personal.';

revoke all on public.people_coach_consents from anon;
revoke all on public.people_coach_sessions from anon;
revoke all on public.people_coach_shares from anon;
grant select on public.people_coach_consents to authenticated;
grant select on public.people_coach_sessions to authenticated;
grant select on public.people_coach_shares to authenticated;
