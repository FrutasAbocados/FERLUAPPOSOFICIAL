-- Trigger functions are invoked by PostgreSQL, never directly through PostgREST.
-- Keep owner/service_role execution while closing the unnecessary RPC surface.

revoke execute on function public.ferlu_emit_caja_cierre_dia()
  from public, anon, authenticated;
revoke execute on function public.ferlu_emit_cobros_deuda_alta()
  from public, anon, authenticated;
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
revoke execute on function public.manager_abuelo_borrar_espejo()
  from public, anon, authenticated;
revoke execute on function public.notif_puntos_trigger()
  from public, anon, authenticated;
revoke execute on function public.notif_tareas_trigger()
  from public, anon, authenticated;
revoke execute on function public.notif_vacaciones_trigger()
  from public, anon, authenticated;
revoke execute on function public.notificaciones_push_after_insert()
  from public, anon, authenticated;
revoke execute on function public.tesoreria_sync_cierre_fn()
  from public, anon, authenticated;
revoke execute on function public.tesoreria_update_cierre_fn()
  from public, anon, authenticated;
revoke execute on function public.trab_credito_recalcular_total()
  from public, anon, authenticated;
revoke execute on function public.trab_pts_touch_updated()
  from public, anon, authenticated;
revoke execute on function public.trab_vac_touch_updated()
  from public, anon, authenticated;
