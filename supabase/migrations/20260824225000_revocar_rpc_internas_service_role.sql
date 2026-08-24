-- Internal edge helpers are called with the service-role key, not user JWTs.
revoke execute on function public.notif_empleados_activos()
  from public, anon, authenticated;
revoke execute on function public.notif_snapshot_empleado(uuid)
  from public, anon, authenticated;
revoke execute on function public.pedidos_wa_resolver_completo(uuid)
  from public, anon, authenticated;
revoke execute on function public.push_targets_para_notificacion(uuid)
  from public, anon, authenticated;

-- Lumo OS brokers intentionally remain available to anon (token protected) and
-- service_role. Authenticated AbocadosOS users do not consume these endpoints.
revoke execute on function public.lumo_os_abocados_snapshot(text, date)
  from authenticated;
revoke execute on function public.lumo_os_abocados_ocr_snapshot(text, date)
  from authenticated;

-- Legacy helper superseded by the current ruleta self-service RPCs.
revoke execute on function public.ruleta_saldo_self()
  from public, anon, authenticated;
