-- Tesorería: admin_op (Álvaro) también puede crear, editar y borrar movimientos.
-- Antes solo admin_full escribía y admin_op leía; el alta fallaba por RLS.

drop policy if exists tesoreria_movimientos_cons_ins on public.tesoreria_movimientos;
drop policy if exists tesoreria_movimientos_cons_upd on public.tesoreria_movimientos;
drop policy if exists tesoreria_movimientos_cons_del on public.tesoreria_movimientos;

create policy tesoreria_movimientos_cons_ins
  on public.tesoreria_movimientos for insert to authenticated
  with check (public.is_admin());

create policy tesoreria_movimientos_cons_upd
  on public.tesoreria_movimientos for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy tesoreria_movimientos_cons_del
  on public.tesoreria_movimientos for delete to authenticated
  using (public.is_admin());
