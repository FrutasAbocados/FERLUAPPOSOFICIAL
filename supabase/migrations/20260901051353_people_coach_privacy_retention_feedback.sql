-- Controles de privacidad, retención y feedback del piloto de Lumo People.
-- Los eventos técnicos no almacenan texto conversacional ni contenido de perfil.

create table if not exists public.people_coach_privacy_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  employee_id uuid references public.empleados(id) on delete set null,
  event_type text not null check (event_type in (
    'profile_updated',
    'profile_withdrawn',
    'profile_forgotten',
    'private_summary_expired',
    'profile_candidate_expired',
    'session_expired'
  )),
  entity_type text not null check (entity_type in ('profile_item', 'session', 'retention_batch')),
  entity_id uuid,
  affected_rows integer not null default 1 check (affected_rows >= 0),
  occurred_at timestamptz not null default now()
);

create index if not exists people_coach_privacy_events_owner_recent_idx
  on public.people_coach_privacy_events (user_id, occurred_at desc);

alter table public.people_coach_privacy_events enable row level security;

create policy "people privacy events: trabajador lee propios"
  on public.people_coach_privacy_events for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "people privacy events: admin lee auditoria tecnica"
  on public.people_coach_privacy_events for select
  to authenticated
  using (public.is_admin());

revoke all on public.people_coach_privacy_events from public, anon, authenticated;
grant select on public.people_coach_privacy_events to authenticated;

comment on table public.people_coach_privacy_events is
  'Auditoría técnica de privacidad. Guarda actor, acción, entidad, recuento y fecha; nunca conversación, resumen ni texto de perfil.';

create table if not exists public.people_coach_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.people_coach_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references public.empleados(id) on delete cascade,
  useful_score smallint not null check (useful_score between 1 and 5),
  heard_score smallint not null check (heard_score between 1 and 5),
  privacy_score smallint not null check (privacy_score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists people_coach_feedback_recent_idx
  on public.people_coach_feedback (created_at desc);

drop trigger if exists trg_people_coach_feedback_updated_at on public.people_coach_feedback;
create trigger trg_people_coach_feedback_updated_at
  before update on public.people_coach_feedback
  for each row execute function public.touch_updated_at();

alter table public.people_coach_feedback enable row level security;

create policy "people feedback: trabajador lee propio"
  on public.people_coach_feedback for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.empleados e
      where e.id = people_coach_feedback.employee_id
        and e.user_id = (select auth.uid())
        and e.activo
    )
  );

revoke all on public.people_coach_feedback from public, anon, authenticated;
grant select on public.people_coach_feedback to authenticated;

comment on table public.people_coach_feedback is
  'Feedback individual privado del piloto. Dirección solo recibe el agregado global cuando participan al menos tres trabajadores.';

create or replace function public.people_coach_feedback_metrics()
returns table (
  participant_count integer,
  response_count integer,
  useful_average numeric,
  heard_average numeric,
  privacy_average numeric,
  suppressed boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_participants integer;
  v_responses integer;
  v_useful numeric;
  v_heard numeric;
  v_privacy numeric;
begin
  if not public.is_admin() then
    raise exception 'Solo administración puede consultar métricas agregadas del coach' using errcode = '42501';
  end if;

  select
    count(distinct f.employee_id)::integer,
    count(*)::integer,
    round(avg(f.useful_score)::numeric, 2),
    round(avg(f.heard_score)::numeric, 2),
    round(avg(f.privacy_score)::numeric, 2)
  into v_participants, v_responses, v_useful, v_heard, v_privacy
  from public.people_coach_feedback f
  where f.created_at >= now() - interval '90 days';

  if v_participants < 3 then
    return query select 0, 0, null::numeric, null::numeric, null::numeric, true;
    return;
  end if;

  return query select v_participants, v_responses, v_useful, v_heard, v_privacy, false;
end;
$$;

revoke all on function public.people_coach_feedback_metrics() from public, anon;
grant execute on function public.people_coach_feedback_metrics() to authenticated;

create or replace function public.people_coach_apply_retention()
returns table (
  private_summaries_cleared integer,
  profile_candidates_removed integer,
  sessions_removed integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_private_summaries integer := 0;
  v_profile_candidates integer := 0;
  v_sessions integer := 0;
begin
  update public.people_coach_sessions s
  set private_summary = '{}'::jsonb,
      updated_at = now()
  where coalesce(s.ended_at, s.created_at) < now() - interval '30 days'
    and s.private_summary <> '{}'::jsonb;
  get diagnostics v_private_summaries = row_count;

  delete from public.people_coach_profile_items p
  where p.created_at < now() - interval '30 days'
    and p.visibility = 'private_employee'
    and p.decision in ('pending', 'declined');
  get diagnostics v_profile_candidates = row_count;

  delete from public.people_coach_sessions s
  where s.created_at < now() - interval '180 days';
  get diagnostics v_sessions = row_count;

  if v_private_summaries > 0 then
    insert into public.people_coach_privacy_events (event_type, entity_type, affected_rows)
    values ('private_summary_expired', 'retention_batch', v_private_summaries);
  end if;
  if v_profile_candidates > 0 then
    insert into public.people_coach_privacy_events (event_type, entity_type, affected_rows)
    values ('profile_candidate_expired', 'retention_batch', v_profile_candidates);
  end if;
  if v_sessions > 0 then
    insert into public.people_coach_privacy_events (event_type, entity_type, affected_rows)
    values ('session_expired', 'retention_batch', v_sessions);
  end if;

  return query select v_private_summaries, v_profile_candidates, v_sessions;
end;
$$;

revoke all on function public.people_coach_apply_retention() from public, anon, authenticated;
grant execute on function public.people_coach_apply_retention() to service_role;

comment on function public.people_coach_apply_retention() is
  'Borra resumen privado a 30 días, candidatos privados no confirmados a 30 días y sesiones/resúmenes operativos a 180 días. La auditoría solo conserva recuentos.';

-- Una única ejecución diaria. El perfil confirmado se conserva hasta que su
-- propietario lo retire u olvide expresamente.
select cron.unschedule(jobid)
from cron.job
where jobname = 'people-coach-retention-daily';

select cron.schedule(
  'people-coach-retention-daily',
  '23 3 * * *',
  'select public.people_coach_apply_retention();'
);
