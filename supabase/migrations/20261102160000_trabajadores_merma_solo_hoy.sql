-- Merma: el trabajador solo puede registrar merma con fecha de hoy (Madrid).
-- Evita altas retroactivas llamando a la API directamente.

drop policy if exists "merma: alta propia" on public.trabajadores_merma;
create policy "merma: alta propia"
  on public.trabajadores_merma
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and empleado_id = (select public.merma_empleado_propio_id())
    and fecha = (now() at time zone 'Europe/Madrid')::date
  );
