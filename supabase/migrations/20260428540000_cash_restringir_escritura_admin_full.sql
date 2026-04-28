-- Cash: solo admin_full puede crear/editar/borrar cierres.
-- admin_op (Álvaro) sigue pudiendo leer pero no modificar — los cierres son
-- la fuente contable y ediciones retroactivas distorsionan KPIs históricos.

drop policy if exists "cierres: admin R/W" on public.cierres;

create policy "cierres: select admin"
  on public.cierres for select
  using (public.is_admin());

create policy "cierres: write admin_full"
  on public.cierres for all
  using (public.is_admin_full())
  with check (public.is_admin_full());
