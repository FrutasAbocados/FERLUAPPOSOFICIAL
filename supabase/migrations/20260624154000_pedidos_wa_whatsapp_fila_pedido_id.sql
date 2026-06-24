-- Marca la fila de staging WA que ya se paso a pedidos_wa.
-- Evita duplicados cuando Luis usa "Pasar a Hoy" desde WA auto.

alter table public.pedidos_wa_whatsapp_filas
  add column if not exists pedido_id uuid references public.pedidos_wa(id) on delete set null;

create index if not exists pedidos_wa_whatsapp_filas_pedido_idx
  on public.pedidos_wa_whatsapp_filas (pedido_id)
  where pedido_id is not null;
