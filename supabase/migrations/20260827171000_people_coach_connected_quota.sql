-- La cuota cuenta conexiones reales (started_at), aunque el trabajador cierre
-- la pestaña sin enviar el cierre. Los fallos previos a conectar no la consumen.

create index if not exists people_coach_started_quota_idx
  on public.people_coach_sessions (user_id, started_at desc)
  where started_at is not null;
