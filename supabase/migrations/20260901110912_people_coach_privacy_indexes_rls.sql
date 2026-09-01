-- Consolida la lectura de auditoría en una única policy y cubre las claves
-- foráneas nuevas usadas por RLS y borrado en cascada.

drop policy if exists "people privacy events: trabajador lee propios"
  on public.people_coach_privacy_events;
drop policy if exists "people privacy events: admin lee auditoria tecnica"
  on public.people_coach_privacy_events;

create policy "people privacy events: propietario o admin lee auditoria tecnica"
  on public.people_coach_privacy_events for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
  );

create index if not exists people_coach_privacy_events_employee_idx
  on public.people_coach_privacy_events (employee_id)
  where employee_id is not null;

create index if not exists people_coach_feedback_owner_recent_idx
  on public.people_coach_feedback (user_id, created_at desc);

create index if not exists people_coach_feedback_employee_recent_idx
  on public.people_coach_feedback (employee_id, created_at desc);
