-- Gastos también está disponible para el administrador operativo (Álvaro).
-- Mantiene su rol y el resto de permisos; no concede administración completa.
alter policy "gastos_fijos: admin_full rw" on public.gastos_fijos
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "gastos_fijos: admin_full rw" on public.gastos_fijos
  rename to "gastos_fijos: admin rw";
