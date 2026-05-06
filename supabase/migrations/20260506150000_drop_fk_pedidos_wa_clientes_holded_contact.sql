-- El holded_contact_id puede llegar antes de que el sync horario lo materialice
-- en manager_contactos. La FK rígida bloqueaba la creación de clientes nuevos.
-- Dejamos la columna como text suelta (sin integridad) — solo se usa para
-- enlazar manualmente la factura en Holded más adelante.
alter table public.pedidos_wa_clientes
  drop constraint if exists pedidos_wa_clientes_holded_contact_id_fkey;
