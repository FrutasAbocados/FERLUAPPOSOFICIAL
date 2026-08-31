-- Evita reevaluar auth.uid() por cada fila en las policies privadas del coach.
-- El contrato de acceso no cambia: cada trabajador sigue viendo solo sus datos.

drop policy if exists "people consent: trabajador lee propio"
  on public.people_coach_consents;

create policy "people consent: trabajador lee propio"
  on public.people_coach_consents for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.empleados e
      where e.id = people_coach_consents.employee_id
        and e.user_id = (select auth.uid())
        and e.activo
    )
  );

drop policy if exists "people sessions: trabajador lee propio"
  on public.people_coach_sessions;

create policy "people sessions: trabajador lee propio"
  on public.people_coach_sessions for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.empleados e
      where e.id = people_coach_sessions.employee_id
        and e.user_id = (select auth.uid())
        and e.activo
    )
  );

drop policy if exists "people shares: trabajador lee lo compartido"
  on public.people_coach_shares;

create policy "people shares: trabajador lee lo compartido"
  on public.people_coach_shares for select
  to authenticated
  using (user_id = (select auth.uid()));
