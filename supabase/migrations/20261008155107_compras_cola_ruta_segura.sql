-- La ruta del PDF en cola la escribe la app y el worker la usa con la service
-- key: solo se admite la forma exacta `cola/<lote>/<n>-<uuid>.pdf`, nunca `../`.
alter table public.pedidos_wa_compras_cola
  drop constraint if exists pedidos_wa_compras_cola_storage_path_formato;
alter table public.pedidos_wa_compras_cola
  add constraint pedidos_wa_compras_cola_storage_path_formato
  check (storage_path ~ '^cola/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{1,3}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$');
