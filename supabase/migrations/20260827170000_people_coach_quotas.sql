-- Una única sesión abierta por trabajador. Las cuotas temporales se validan
-- también en la Edge Function antes de consumir API.

create unique index if not exists people_coach_one_open_session_per_user_idx
  on public.people_coach_sessions (user_id)
  where status in ('pending', 'active', 'processing');

create index if not exists people_coach_completed_quota_idx
  on public.people_coach_sessions (user_id, created_at desc)
  where status = 'completed';
