-- ============================================================================
-- Vacaciones — empleado puede solicitar (insert) sus propias vacaciones
-- ============================================================================
-- El estado se fuerza a 'pendiente'. Solo admins (admin_full / admin_op /
-- responsable) pueden aprobar/denegar (cambiar estado).
-- ============================================================================

drop policy if exists "vacaciones: empleado solicita propio" on public.trabajadores_vacaciones;
create policy "vacaciones: empleado solicita propio"
  on public.trabajadores_vacaciones for insert
  with check (
    estado = 'pendiente'
    and exists (
      select 1 from public.empleados e
      where e.id = empleado_id and e.user_id = auth.uid()
    )
  );

-- Empleado puede borrar su solicitud SI sigue pendiente
drop policy if exists "vacaciones: empleado borra propio pendiente" on public.trabajadores_vacaciones;
create policy "vacaciones: empleado borra propio pendiente"
  on public.trabajadores_vacaciones for delete
  using (
    estado = 'pendiente'
    and exists (
      select 1 from public.empleados e
      where e.id = empleado_id and e.user_id = auth.uid()
    )
  );
