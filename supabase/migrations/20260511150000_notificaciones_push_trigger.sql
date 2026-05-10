-- Trigger que dispara notif-push-send al insertar en notificaciones.
-- Esta era la pieza que faltaba: las suscripciones y la edge existían,
-- pero nada conectaba el INSERT con el envío real al móvil.

create or replace function public.notificaciones_push_after_insert()
returns trigger language plpgsql security definer as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_key is null then return NEW; end if;

  perform net.http_post(
    url     := 'https://ucjkyjhvvdofyaizzdbk.supabase.co/functions/v1/notif-push-send',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('notif_id', NEW.id::text),
    timeout_milliseconds := 10000
  );

  return NEW;
end;
$$;

drop trigger if exists notificaciones_push_trigger on public.notificaciones;

create trigger notificaciones_push_trigger
  after insert on public.notificaciones
  for each row
  execute function public.notificaciones_push_after_insert();
