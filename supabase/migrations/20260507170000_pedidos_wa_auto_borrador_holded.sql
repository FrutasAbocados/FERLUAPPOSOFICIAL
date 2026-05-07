-- Auto-creación de borradores en Holded cuando un pedido WA pasa a 'confirmado'.
--
-- Flujo:
--   1. Luis/admin pulsa "Confirmar pedido" en la UI → estado pasa a 'confirmado'
--   2. Trigger AFTER UPDATE detecta el cambio y llama a la edge `pedido-a-holded` vía pg_net
--   3. Edge crea el doc en Holded como borrador (approveDoc=0) y rellena
--      pedidos_wa.holded_invoice_id / holded_invoice_num
--
-- Idempotencia: si holded_invoice_id ya está set, el trigger no hace nada.

-- 1) Ampliar el check constraint de estado para añadir 'confirmado'.
alter table public.pedidos_wa drop constraint if exists pedidos_wa_estado_check;
alter table public.pedidos_wa
  add constraint pedidos_wa_estado_check
  check (estado in ('pendiente','confirmado','preparado','entregado','cancelado'));

-- 2) Settings para que el trigger sepa a qué URL llamar.
-- Los derivamos de notif_push_* sustituyendo el slug de la edge.
insert into public.app_settings (key, value)
select 'pedido_holded_url',
       replace(value, '/notif-push-send', '/pedido-a-holded')
  from public.app_settings where key = 'notif_push_url'
on conflict (key) do update
  set value = excluded.value, updated_at = now();

insert into public.app_settings (key, value)
select 'pedido_holded_anon_key', value
  from public.app_settings where key = 'notif_push_anon_key'
on conflict (key) do update
  set value = excluded.value, updated_at = now();

-- 3) Función trigger: dispara llamada a la edge function cuando se confirma el pedido.
create or replace function public.pedidos_wa_confirmado_dispatch()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url      text;
  v_anon_key text;
begin
  -- Solo cuando estado pasa a 'confirmado' y aún no se ha subido a Holded
  if new.estado <> 'confirmado' then return new; end if;
  if new.holded_invoice_id is not null then return new; end if;
  if old.estado = 'confirmado' then return new; end if;

  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return new;
  end if;

  select value into v_url      from public.app_settings where key = 'pedido_holded_url';
  select value into v_anon_key from public.app_settings where key = 'pedido_holded_anon_key';
  if v_url is null or v_url = '' then return new; end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon_key, '')
    ),
    body := jsonb_build_object('pedido_id', new.id, 'auto', true)
  );
  return new;
end; $$;

drop trigger if exists pedidos_wa_confirmado_dispatch_t on public.pedidos_wa;
create trigger pedidos_wa_confirmado_dispatch_t
  after update of estado on public.pedidos_wa
  for each row execute function public.pedidos_wa_confirmado_dispatch();
