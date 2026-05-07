-- Receptor de webhooks Holded para sincronizar estado de docs subidos.
-- Holded emite eventos cuando un documento se crea/edita/aprueba/elimina.
-- La edge `holded-webhook` los recibe y actualiza estos campos.

alter table public.pedidos_wa
  add column if not exists holded_status text null,                 -- 'draft' | 'approved' | 'deleted' (lo que diga Holded)
  add column if not exists holded_total numeric(12,2) null,         -- total final tras edición en Holded
  add column if not exists holded_last_webhook_at timestamptz null;

comment on column public.pedidos_wa.holded_status is
  'Estado en Holded recibido vía webhook. Permite saber si un borrador ya se aprobó.';

-- Setting con el secreto compartido entre Holded y la edge.
-- Generamos uno aleatorio si no existe.
insert into public.app_settings (key, value)
values ('holded_webhook_secret', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;
