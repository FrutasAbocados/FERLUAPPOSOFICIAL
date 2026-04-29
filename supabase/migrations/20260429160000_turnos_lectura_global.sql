-- ============================================================================
-- Turnos — todos los autenticados pueden leer todos los turnos
-- ============================================================================
-- Antes: empleado solo veía sus propios turnos. Pedido por usuario:
-- cada trabajador necesita ver el cuadrante completo del equipo para
-- coordinarse. Sigue siendo solo lectura para empleados; admins R/W.
-- ============================================================================

drop policy if exists "turnos: empleado lee sus propios" on public.turnos;
drop policy if exists "turnos: auth lee todos" on public.turnos;

create policy "turnos: auth lee todos" on public.turnos
  for select
  using (auth.role() = 'authenticated');
