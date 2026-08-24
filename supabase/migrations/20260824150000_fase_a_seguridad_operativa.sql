-- Fase A de la auditoria 2026-08-24:
-- 1. Cierra la escritura anonima a empleados_equipo.
-- 2. Restaura pdf_url en manager_abuelo_facturas.
-- 3. Elimina el envio push anonimo duplicado y conserva el evento del bus.
-- 4. Limita RPC SECURITY DEFINER al permiso funcional correspondiente.

-- ---------------------------------------------------------------------------
-- Vistas: exposicion de solo lectura
-- ---------------------------------------------------------------------------

revoke all on public.empleados_equipo from anon, authenticated;
grant select on public.empleados_equipo to authenticated;

create or replace view public.manager_abuelo_facturas
with (security_invoker = on)
as
select
  f.id,
  f.fecha,
  f.numero_factura,
  f.nota,
  coalesce(f.subtotal, 0) as subtotal,
  coalesce(f.total, f.importe) as total,
  (
    select count(*)
    from public.manager_lineas_abuelo l
    where l.factura_id = f.id
  ) as num_lineas,
  f.created_by,
  f.created_at,
  f.pdf_url
from public.manager_ventas_abuelo f;

revoke all on public.manager_abuelo_facturas from anon, authenticated;
grant select on public.manager_abuelo_facturas to authenticated;

-- ---------------------------------------------------------------------------
-- Push: un solo envio real con service_role; este trigger conserva solo el bus
-- ---------------------------------------------------------------------------

create or replace function public.notif_push_dispatch_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.emit_event(
    'ferlu.notificacion.push_solicitada',
    jsonb_build_object(
      'notificacion_id', new.id,
      'titulo',          new.titulo,
      'mensaje',         new.cuerpo,
      'tipo',            new.tipo,
      'user_id',         new.empleado_id,
      'url',             (new.payload->>'url')
    ),
    'notificaciones',
    'medium'
  );

  return new;
end;
$$;

revoke all on function public.notif_push_dispatch_trigger() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Manager: wrapper autorizado; la implementacion existente queda privada
-- ---------------------------------------------------------------------------

alter function public.manager_refresh_coste_alias()
  rename to manager_refresh_coste_alias_internal;

revoke all on function public.manager_refresh_coste_alias_internal()
  from public, anon, authenticated;
grant execute on function public.manager_refresh_coste_alias_internal()
  to service_role;

create function public.manager_refresh_coste_alias()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not coalesce(public.puede_ver_manager(), false) then
    raise exception 'Sin permisos para recalcular costes de Manager'
      using errcode = '42501';
  end if;

  perform public.manager_refresh_coste_alias_internal();
end;
$$;

revoke all on function public.manager_refresh_coste_alias()
  from public, anon;
grant execute on function public.manager_refresh_coste_alias()
  to authenticated, service_role;

-- La purga solo la ejecutan pg_cron o service_role.
revoke all on function public.notificaciones_purgar_antiguas()
  from public, anon, authenticated;
grant execute on function public.notificaciones_purgar_antiguas()
  to service_role;

-- ---------------------------------------------------------------------------
-- Pedidos recurrentes: wrapper autorizado; cron y service_role siguen activos
-- ---------------------------------------------------------------------------

alter function public.pedidos_wa_recurrentes_generar(date)
  rename to pedidos_wa_recurrentes_generar_internal;

revoke all on function public.pedidos_wa_recurrentes_generar_internal(date)
  from public, anon, authenticated;
grant execute on function public.pedidos_wa_recurrentes_generar_internal(date)
  to service_role;

create function public.pedidos_wa_recurrentes_generar(p_fecha date)
returns table (
  recurrente_id uuid,
  pedido_id uuid,
  status text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null
     and not coalesce(public.puede_operar_pedidos_wa(), false) then
    raise exception 'Sin permisos para generar pedidos recurrentes'
      using errcode = '42501';
  end if;

  return query
  select *
  from public.pedidos_wa_recurrentes_generar_internal(p_fecha);
end;
$$;

revoke all on function public.pedidos_wa_recurrentes_generar(date)
  from public, anon;
grant execute on function public.pedidos_wa_recurrentes_generar(date)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Push subscriptions: cada usuario solo puede borrar su propio endpoint
-- ---------------------------------------------------------------------------

create or replace function public.push_subscription_delete(p_endpoint text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint
    and (
      auth.role() = 'service_role'
      or user_id = auth.uid()
    );
$$;

revoke all on function public.push_subscription_delete(text)
  from public, anon;
grant execute on function public.push_subscription_delete(text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seguimiento de clientes: misma autorizacion que las policies de la tabla
-- ---------------------------------------------------------------------------

create or replace function public.seguimiento_excluir(
  p_name text,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (
    coalesce(public.puede_ver_clientes(), false)
    or coalesce(public.es_operaciones(), false)
  ) then
    raise exception 'Sin permisos para modificar el seguimiento de clientes'
      using errcode = '42501';
  end if;

  insert into public.clientes_programa(
    contact_name_canon,
    excluido_seguimiento,
    motivo_exclusion
  )
  values (p_name, true, p_motivo)
  on conflict (contact_name_canon)
  do update set
    excluido_seguimiento = true,
    motivo_exclusion = excluded.motivo_exclusion,
    updated_at = now();
end;
$$;

create or replace function public.seguimiento_restaurar(p_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (
    coalesce(public.puede_ver_clientes(), false)
    or coalesce(public.es_operaciones(), false)
  ) then
    raise exception 'Sin permisos para modificar el seguimiento de clientes'
      using errcode = '42501';
  end if;

  update public.clientes_programa
  set
    excluido_seguimiento = false,
    motivo_exclusion = null,
    updated_at = now()
  where contact_name_canon = p_name;
end;
$$;

create or replace function public.seguimiento_marcar_llamado(p_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (
    coalesce(public.puede_ver_clientes(), false)
    or coalesce(public.es_operaciones(), false)
  ) then
    raise exception 'Sin permisos para modificar el seguimiento de clientes'
      using errcode = '42501';
  end if;

  insert into public.clientes_programa(
    contact_name_canon,
    llamado_seguimiento_at
  )
  values (p_name, now())
  on conflict (contact_name_canon)
  do update set
    llamado_seguimiento_at = excluded.llamado_seguimiento_at,
    updated_at = now();
end;
$$;

revoke all on function public.seguimiento_excluir(text, text)
  from public, anon;
revoke all on function public.seguimiento_restaurar(text)
  from public, anon;
revoke all on function public.seguimiento_marcar_llamado(text)
  from public, anon;

grant execute on function public.seguimiento_excluir(text, text)
  to authenticated, service_role;
grant execute on function public.seguimiento_restaurar(text)
  to authenticated, service_role;
grant execute on function public.seguimiento_marcar_llamado(text)
  to authenticated, service_role;
