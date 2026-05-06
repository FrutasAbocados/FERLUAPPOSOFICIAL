-- Permitir mover un pedido a otro repartidor/horario/salida puntualmente,
-- sin modificar el cliente. Si el override es null, se hereda del cliente.
alter table public.pedidos_wa
  add column if not exists override_repartidor text,
  add column if not exists override_horario    text,
  add column if not exists override_salida     text;

alter table public.pedidos_wa
  drop constraint if exists pedidos_wa_override_repartidor_check;
alter table public.pedidos_wa
  add  constraint pedidos_wa_override_repartidor_check
  check (override_repartidor is null or override_repartidor in ('TORRES','GERMAN','RAUL','ALEX'));

alter table public.pedidos_wa
  drop constraint if exists pedidos_wa_override_salida_check;
alter table public.pedidos_wa
  add  constraint pedidos_wa_override_salida_check
  check (override_salida is null or override_salida in ('PRIMERA','SEGUNDA'));
