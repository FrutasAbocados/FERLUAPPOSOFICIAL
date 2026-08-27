-- Control global y presupuesto mensual del coach.
-- La reserva de 0,50 US$ por conexión impide superar el presupuesto aunque
-- varios trabajadores intenten entrar al mismo tiempo.

create table if not exists public.people_coach_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  monthly_budget_usd numeric(10, 2) not null default 20
    check (monthly_budget_usd between 1 and 500),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.people_coach_settings (singleton, enabled, monthly_budget_usd)
values (true, true, 20)
on conflict (singleton) do nothing;

alter table public.people_coach_settings enable row level security;
revoke all on public.people_coach_settings from public, anon, authenticated;

create or replace function public.people_coach_budget_snapshot()
returns table (
  enabled boolean,
  monthly_budget_usd numeric,
  spent_usd numeric,
  reserved_usd numeric,
  total_committed_usd numeric
)
language sql
security definer
stable
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', now() at time zone 'Europe/Madrid')
      at time zone 'Europe/Madrid' as month_start
  ), totals as (
    select
      coalesce(sum(s.estimated_cost_usd) filter (where s.estimated_cost_usd is not null), 0)::numeric as spent,
      coalesce(sum(0.50) filter (
        where s.estimated_cost_usd is null
          and (s.started_at is not null or s.status in ('pending', 'active', 'processing'))
      ), 0)::numeric as reserved
    from public.people_coach_sessions s
    cross join bounds b
    where s.created_at >= b.month_start
  )
  select cfg.enabled,
         cfg.monthly_budget_usd,
         totals.spent,
         totals.reserved,
         totals.spent + totals.reserved
  from public.people_coach_settings cfg
  cross join totals
  where cfg.singleton;
$$;

revoke all on function public.people_coach_budget_snapshot() from public, anon, authenticated;
grant execute on function public.people_coach_budget_snapshot() to service_role;

create or replace function public.people_coach_admin_status()
returns table (
  enabled boolean,
  monthly_budget_usd numeric,
  spent_usd numeric,
  reserved_usd numeric,
  total_committed_usd numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo administración puede consultar el control del coach' using errcode = '42501';
  end if;
  return query select * from public.people_coach_budget_snapshot();
end;
$$;

revoke all on function public.people_coach_admin_status() from public, anon;
grant execute on function public.people_coach_admin_status() to authenticated;

create or replace function public.people_coach_admin_update(
  p_enabled boolean,
  p_monthly_budget_usd numeric
)
returns table (
  enabled boolean,
  monthly_budget_usd numeric,
  spent_usd numeric,
  reserved_usd numeric,
  total_committed_usd numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo administración puede modificar el control del coach' using errcode = '42501';
  end if;
  if p_monthly_budget_usd is null or p_monthly_budget_usd < 1 or p_monthly_budget_usd > 500 then
    raise exception 'El presupuesto debe estar entre 1 y 500 US$' using errcode = '22023';
  end if;

  update public.people_coach_settings s
  set enabled = p_enabled,
      monthly_budget_usd = round(p_monthly_budget_usd, 2),
      updated_by = auth.uid(),
      updated_at = now()
  where s.singleton;

  return query select * from public.people_coach_budget_snapshot();
end;
$$;

revoke all on function public.people_coach_admin_update(boolean, numeric) from public, anon;
grant execute on function public.people_coach_admin_update(boolean, numeric) to authenticated;

create or replace function public.people_coach_reserve_session(
  p_user_id uuid,
  p_employee_id uuid,
  p_session_type text,
  p_prompt_version text
)
returns table (
  session_id uuid,
  error_code text,
  monthly_budget_usd numeric,
  total_committed_usd numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_budget numeric;
  v_committed numeric;
  v_session_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Europe/Madrid')
    at time zone 'Europe/Madrid';
begin
  select s.enabled, s.monthly_budget_usd
  into v_enabled, v_budget
  from public.people_coach_settings s
  where s.singleton
  for update;

  if not found or not v_enabled then
    return query select null::uuid, 'coach_disabled'::text, coalesce(v_budget, 0), 0::numeric;
    return;
  end if;

  select coalesce(sum(
    case
      when s.estimated_cost_usd is not null then s.estimated_cost_usd
      when s.started_at is not null or s.status in ('pending', 'active', 'processing') then 0.50
      else 0
    end
  ), 0)::numeric
  into v_committed
  from public.people_coach_sessions s
  where s.created_at >= v_month_start;

  if v_committed + 0.50 > v_budget then
    return query select null::uuid, 'monthly_budget_reached'::text, v_budget, v_committed;
    return;
  end if;

  begin
    insert into public.people_coach_sessions (
      user_id,
      employee_id,
      session_type,
      status,
      transcript_storage_enabled,
      prompt_version
    ) values (
      p_user_id,
      p_employee_id,
      p_session_type,
      'pending',
      false,
      p_prompt_version
    ) returning id into v_session_id;
  exception when unique_violation then
    return query select null::uuid, 'session_in_progress'::text, v_budget, v_committed;
    return;
  end;

  return query select v_session_id, null::text, v_budget, v_committed + 0.50;
end;
$$;

revoke all on function public.people_coach_reserve_session(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.people_coach_reserve_session(uuid, uuid, text, text)
  to service_role;

comment on table public.people_coach_settings is
  'Interruptor global y presupuesto mensual del coach. No contiene información privada de trabajadores.';
