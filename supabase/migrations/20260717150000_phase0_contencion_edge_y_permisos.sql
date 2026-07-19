-- Fase 0 de contención (auditoría 2026-07-17).
-- Sustituye anon/no-auth por service_role desde Vault en jobs internos y
-- elimina EXECUTE público de funciones SECURITY DEFINER recientes.

create or replace function public.pedidos_wa_confirmado_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_url         text;
  v_service_key text;
  v_cliente     record;
  v_lineas      jsonb;
begin
  if new.estado <> 'confirmado' then return new; end if;
  if new.holded_invoice_id is not null then return new; end if;
  if old.estado = 'confirmado' then return new; end if;

  if exists (select 1 from pg_extension where extname = 'pg_net') then
    select value into v_url
    from public.app_settings
    where key = 'pedido_holded_url';

    select decrypted_secret into v_service_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;

    if v_url is not null and v_url <> '' and v_service_key is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object('pedido_id', new.id, 'auto', true),
        timeout_milliseconds := 30000
      );
    end if;
  end if;

  select nombre,
         holded_contact_id,
         coalesce(holded_doc_type, 'invoice') as doc_type
  into v_cliente
  from public.pedidos_wa_clientes
  where id = new.cliente_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'producto', coalesce(l.producto_normalizado, l.producto_raw),
        'cantidad', l.cantidad,
        'unidad', l.unidad
      ) order by l.orden
    ),
    '[]'::jsonb
  )
  into v_lineas
  from public.pedidos_wa_lineas l
  where l.pedido_id = new.id;

  perform public.emit_event(
    'ferlu.pedido_wa.confirmado',
    jsonb_build_object(
      'pedido_id', new.id,
      'cliente_id', new.cliente_id,
      'cliente_nombre', coalesce(v_cliente.nombre, ''),
      'doc_type', coalesce(new.holded_invoice_doc_type, v_cliente.doc_type, 'invoice'),
      'holded_contact_id', v_cliente.holded_contact_id,
      'holded_invoice_id', null,
      'holded_invoice_num', null,
      'fecha_entrega', new.fecha::text,
      'lineas', coalesce(v_lineas, '[]'::jsonb)
    ),
    'pedidos_wa',
    'high'
  );

  return new;
end;
$function$;

revoke execute on function public.pedidos_wa_confirmado_dispatch() from public, anon, authenticated;
grant execute on function public.pedidos_wa_confirmado_dispatch() to service_role;

create or replace function public.pedidos_wa_reconciliar_holded()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_url         text;
  v_service_key text;
  v_rec         record;
  v_n           integer := 0;
begin
  select value into v_url
  from public.app_settings
  where key = 'pedido_holded_url';

  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_url is null or v_url = '' or v_service_key is null then return 0; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return 0; end if;

  for v_rec in
    select id
    from public.pedidos_wa
    where estado = 'confirmado'
      and holded_invoice_id is null
      and updated_at < now() - interval '3 minutes'
      and updated_at >= now() - interval '2 days'
    order by updated_at
    limit 25
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'pedido_id', v_rec.id,
        'auto', true,
        'reconcile', true
      ),
      timeout_milliseconds := 30000
    );
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

revoke execute on function public.pedidos_wa_reconciliar_holded() from public, anon, authenticated;
grant execute on function public.pedidos_wa_reconciliar_holded() to service_role;

-- Los crons internos usan el service_role guardado en Vault. No se persiste
-- ninguna credencial literal nueva en cron.job ni en el repositorio.
select cron.unschedule(jobid)
from cron.job
where jobname = 'notificaciones-ia-diario';

select cron.schedule(
  'notificaciones-ia-diario',
  '0 7 * * *',
  $cmd$
    select net.http_post(
      url := 'https://ucjkyjhvvdofyaizzdbk.supabase.co/functions/v1/notificaciones-ia',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'service_role_key'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cmd$
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'pedidos-esperados-push';

select cron.schedule(
  'pedidos-esperados-push',
  '0 8 * * *',
  $cmd$
    select net.http_post(
      url := 'https://ucjkyjhvvdofyaizzdbk.supabase.co/functions/v1/pedidos-esperados-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'service_role_key'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cmd$
);

-- Función de mantenimiento: solo backend interno.
revoke execute on function public.manager_refresh_coste_nombre_auto() from public, anon, authenticated;
grant execute on function public.manager_refresh_coste_nombre_auto() to service_role;

-- RPC de lectura: requiere su guard interno y un usuario autenticado; anon no.
revoke execute on function public.objetivo_bbdd_clientes_progreso(integer, date) from public, anon;
grant execute on function public.objetivo_bbdd_clientes_progreso(integer, date) to authenticated, service_role;

-- Funciones trigger: nunca deben ser RPC públicas.
revoke execute on function public.ruleta_desayuno_notif_trigger() from public, anon, authenticated;
revoke execute on function public.clientes_prefs_set_autor() from public, anon, authenticated;
revoke execute on function public.clientes_notas_set_autor() from public, anon, authenticated;
grant execute on function public.ruleta_desayuno_notif_trigger() to service_role;
grant execute on function public.clientes_prefs_set_autor() to service_role;
grant execute on function public.clientes_notas_set_autor() to service_role;

-- Evita que nuevas funciones creadas por postgres hereden EXECUTE de PUBLIC.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
