-- Restaura el acceso seguro a las vistas analíticas de Manager.
--
-- Varias RPC SECURITY INVOKER dependen de estas vistas. Recreaciones posteriores
-- de manager_lineas_efectivas perdieron security_invoker y ambas vistas quedaron
-- sin SELECT para authenticated, provocando 403 aunque las tablas base sí tienen
-- RLS por rol.

alter view public.manager_ventas_efectivas
  set (security_invoker = true);

alter view public.manager_lineas_efectivas
  set (security_invoker = true);

revoke select on public.manager_ventas_efectivas from anon;
revoke select on public.manager_lineas_efectivas from anon;

grant select on public.manager_ventas_efectivas to authenticated;
grant select on public.manager_lineas_efectivas to authenticated;
