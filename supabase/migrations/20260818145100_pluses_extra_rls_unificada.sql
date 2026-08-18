-- Unifica la lectura de pluses en una sola policy para evitar evaluar tres
-- policies permisivas en cada SELECT. La escritura sigue reservada a admin.

drop policy if exists "pluses_extra: admin rw" on public.trabajadores_pluses_extra;
drop policy if exists "pluses_extra: responsable read" on public.trabajadores_pluses_extra;
drop policy if exists "pluses_extra: empleado lee propio" on public.trabajadores_pluses_extra;

create policy "pluses_extra: lectura autorizada"
  on public.trabajadores_pluses_extra for select
  to authenticated
  using (
    public.is_admin()
    or public.es_responsable()
    or exists (
      select 1
      from public.empleados e
      where e.id = trabajadores_pluses_extra.empleado_id
        and e.user_id = auth.uid()
        and e.activo = true
    )
  );

create policy "pluses_extra: admin insert"
  on public.trabajadores_pluses_extra for insert
  to authenticated
  with check (public.is_admin());

create policy "pluses_extra: admin update"
  on public.trabajadores_pluses_extra for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "pluses_extra: admin delete"
  on public.trabajadores_pluses_extra for delete
  to authenticated
  using (public.is_admin());
