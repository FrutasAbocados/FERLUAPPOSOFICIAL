-- Completa la optimización initplan de las policies privadas de People Coach.
-- Conserva el contrato: el trabajador solo ve sus items y debe estar activo.

drop policy if exists "people profile: trabajador lee propio"
  on public.people_coach_profile_items;

create policy "people profile: trabajador lee propio"
  on public.people_coach_profile_items for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.empleados e
      where e.id = people_coach_profile_items.employee_id
        and e.user_id = (select auth.uid())
        and e.activo
    )
  );
