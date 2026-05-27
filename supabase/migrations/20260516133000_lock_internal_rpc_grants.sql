-- Cierre de RPCs internas y lecturas anónimas accidentales.
-- No borra funciones: solo limita EXECUTE público/anónimo y exige sesión en premios ruleta.

revoke execute on function public.crear_user_interno(text, text, public.app_role) from public, anon, authenticated;
grant execute on function public.crear_user_interno(text, text, public.app_role) to service_role;

revoke execute on function public.emit_event(text, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.emit_event(text, jsonb, text, text, uuid) to service_role;

revoke execute on function public.emit_audit_requested() from public, anon, authenticated;
grant execute on function public.emit_audit_requested() to service_role;

revoke execute on function public.notif_emit(text, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.notif_emit(text, uuid, text, text, text, jsonb) to service_role;

revoke execute on function public.notif_empleados_activos() from public, anon;
grant execute on function public.notif_empleados_activos() to authenticated, service_role;

revoke execute on function public.manager_clientes_lista(date, date) from public, anon;
grant execute on function public.manager_clientes_lista(date, date) to authenticated, service_role;

revoke execute on function public.clientes_seguimiento_v2(integer) from public, anon;
grant execute on function public.clientes_seguimiento_v2(integer) to authenticated, service_role;

revoke execute on function public.clientes_seguimiento_excluidos() from public, anon;
grant execute on function public.clientes_seguimiento_excluidos() to authenticated, service_role;

drop policy if exists "ruleta_premios: empleado lee activos" on public.trabajadores_ruleta_premios;
create policy "ruleta_premios: empleado lee activos"
  on public.trabajadores_ruleta_premios for select
  using (
    activo = true
    and exists (
      select 1
      from public.empleados e
      where e.user_id = auth.uid()
        and e.activo = true
    )
  );
