-- Perfiles de colaboración de Lumo People.
-- Ningún elemento es visible para RRHH hasta que el trabajador lo confirma.

create table if not exists public.people_coach_profile_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.people_coach_sessions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references public.empleados(id) on delete cascade,
  category text not null check (category in (
    'motivator',
    'communication_preference',
    'support_preference',
    'energizer',
    'friction',
    'strength_candidate',
    'growth_interest'
  )),
  statement text not null check (char_length(statement) between 1 and 350),
  manager_guidance text check (manager_guidance is null or char_length(manager_guidance) <= 350),
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'declined')),
  visibility text not null default 'private_employee'
    check (visibility in ('private_employee', 'shared_company')),
  employee_confirmed boolean not null default false,
  shared_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (visibility = 'private_employee')
    or (visibility = 'shared_company' and decision = 'approved' and employee_confirmed)
  )
);

create index if not exists people_profile_items_employee_shared_idx
  on public.people_coach_profile_items (employee_id, category, created_at desc)
  where visibility = 'shared_company' and revoked_at is null;

create index if not exists people_profile_items_owner_pending_idx
  on public.people_coach_profile_items (user_id, session_id, created_at)
  where decision = 'pending';

drop trigger if exists trg_people_coach_profile_items_updated_at
  on public.people_coach_profile_items;
create trigger trg_people_coach_profile_items_updated_at
  before update on public.people_coach_profile_items
  for each row execute function public.touch_updated_at();

alter table public.people_coach_profile_items enable row level security;

create policy "people profile: trabajador lee propio"
  on public.people_coach_profile_items for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.empleados e
      where e.id = employee_id and e.user_id = auth.uid() and e.activo
    )
  );

create policy "people profile: admin lee confirmado"
  on public.people_coach_profile_items for select
  to authenticated
  using (
    public.is_admin()
    and visibility = 'shared_company'
    and employee_confirmed
    and revoked_at is null
  );

revoke all on public.people_coach_profile_items from anon;
revoke all on public.people_coach_profile_items from authenticated;
grant select on public.people_coach_profile_items to authenticated;

comment on table public.people_coach_profile_items is
  'Preferencias profesionales propuestas por IA. RRHH solo accede tras confirmación explícita del trabajador.';

-- Auditoría técnica de la entrega del resumen operativo por WhatsApp.
create table if not exists public.people_coach_share_deliveries (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.people_coach_shares(id) on delete cascade,
  channel text not null check (channel in ('whatsapp')),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_message_id text,
  error_code text,
  attempted_at timestamptz not null default now(),
  unique (share_id, channel)
);

alter table public.people_coach_share_deliveries enable row level security;

create policy "people deliveries: admin read"
  on public.people_coach_share_deliveries for select
  to authenticated
  using (public.is_admin());

revoke all on public.people_coach_share_deliveries from anon;
revoke all on public.people_coach_share_deliveries from authenticated;
grant select on public.people_coach_share_deliveries to authenticated;

-- Configuración no secreta. El access token queda como secreto de Edge.
insert into public.app_settings (key, value)
values
  ('people_coach_whatsapp_enabled', 'false'),
  ('people_coach_whatsapp_recipient', ''),
  ('people_coach_whatsapp_template', 'lumo_people_resumen_operativo')
on conflict (key) do nothing;
