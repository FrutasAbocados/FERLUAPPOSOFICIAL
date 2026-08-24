-- Raúl conserva su acceso y Admin puede supervisar el ledger sin modificarlo.
-- Una sola policy SELECT evita policies permisivas solapadas para authenticated.

drop policy if exists "pedidos_tarde: admin read" on public.trabajadores_pedidos_tarde_facturas;
drop policy if exists "pedidos_tarde: raul read" on public.trabajadores_pedidos_tarde_facturas;
drop policy if exists "pedidos_tarde: raul or admin read" on public.trabajadores_pedidos_tarde_facturas;
create policy "pedidos_tarde: raul or admin read"
  on public.trabajadores_pedidos_tarde_facturas for select
  to authenticated
  using (public.es_raul_pedidos_tarde() or public.is_admin());
