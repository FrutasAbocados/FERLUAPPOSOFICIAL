-- manager_lineas_efectivas depende de manager_producto_coste.
-- Esta vista también debe ejecutar con permisos del usuario para respetar RLS.

alter view public.manager_producto_coste
  set (security_invoker = true);

revoke select on public.manager_producto_coste from anon;
grant select on public.manager_producto_coste to authenticated;
