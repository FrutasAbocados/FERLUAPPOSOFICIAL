-- Evita dos policies SELECT permisivas sobre las tablas fiscales. La lectura
-- ya incluye a administracion mediante puede_ver_clientes(); escritura queda
-- separada por operacion y limitada a is_admin().

drop policy if exists "facturacion_clientes: admin rw"
  on public.facturacion_clientes;

create policy "facturacion_clientes: admin insert"
  on public.facturacion_clientes for insert
  with check (public.is_admin());

create policy "facturacion_clientes: admin update"
  on public.facturacion_clientes for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "facturacion_clientes: admin delete"
  on public.facturacion_clientes for delete
  using (public.is_admin());

drop policy if exists "facturacion_cliente_operativo: admin rw"
  on public.facturacion_cliente_operativo;

create policy "facturacion_cliente_operativo: admin insert"
  on public.facturacion_cliente_operativo for insert
  with check (public.is_admin());

create policy "facturacion_cliente_operativo: admin update"
  on public.facturacion_cliente_operativo for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "facturacion_cliente_operativo: admin delete"
  on public.facturacion_cliente_operativo for delete
  using (public.is_admin());
