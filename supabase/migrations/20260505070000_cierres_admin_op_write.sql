-- ============================================================================
-- Cierres Caja (Calendario) — admin_op puede escribir
-- ============================================================================
-- Antes: solo admin_full podía guardar el cierre diario en Calendario.
-- Álvaro (admin_op) reportó 2026-05-05 que no le aparecía el botón Guardar
-- y al destapar la lógica resultó que la RLS también lo impedía.
-- Cambio: la policy ALL pasa de is_admin_full() a is_admin() para que
-- admin_op también pueda hacer upsert/delete de cierres.
-- ============================================================================

drop policy if exists "cierres: write admin_full" on public.cierres;
create policy "cierres: write admin"
  on public.cierres for all
  using (public.is_admin())
  with check (public.is_admin());
