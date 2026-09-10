-- Supabase concede privilegios de tabla por defecto a authenticated y
-- service_role. La auditoria A3 solo puede escribirse desde sus triggers
-- SECURITY DEFINER; los clientes y backends conservan exclusivamente lectura.

revoke all on public.facturacion_eventos_editables
  from anon, authenticated, service_role;
grant select on public.facturacion_eventos_editables
  to authenticated, service_role;

revoke all on sequence public.facturacion_eventos_editables_id_seq
  from anon, authenticated, service_role;
