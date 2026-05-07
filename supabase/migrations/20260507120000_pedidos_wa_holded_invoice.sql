-- Fase 3c — Subir pedidos a Holded como factura/albarán en borrador.
-- Añade holded_doc_type al cliente (invoice/waybill) y holded_invoice_* al pedido.

-- 1. Cliente: tipo de doc Holded (sólo aplica si tipo_factura='HOLDED').
ALTER TABLE public.pedidos_wa_clientes
  ADD COLUMN IF NOT EXISTS holded_doc_type text;

ALTER TABLE public.pedidos_wa_clientes
  DROP CONSTRAINT IF EXISTS pedidos_wa_clientes_holded_doc_type_chk;

ALTER TABLE public.pedidos_wa_clientes
  ADD CONSTRAINT pedidos_wa_clientes_holded_doc_type_chk
  CHECK (holded_doc_type IS NULL OR holded_doc_type IN ('invoice', 'waybill'));

COMMENT ON COLUMN public.pedidos_wa_clientes.holded_doc_type IS
  'Tipo de documento que se crea en Holded para este cliente: invoice (factura) o waybill (albarán). Sólo aplica si tipo_factura=HOLDED. NULL = no decidido aún.';

-- 2. Pedido: link al documento Holded creado (idempotencia + traza).
ALTER TABLE public.pedidos_wa
  ADD COLUMN IF NOT EXISTS holded_invoice_id        text,
  ADD COLUMN IF NOT EXISTS holded_invoice_num       text,
  ADD COLUMN IF NOT EXISTS holded_invoice_doc_type  text,
  ADD COLUMN IF NOT EXISTS holded_invoice_created_at timestamptz;

ALTER TABLE public.pedidos_wa
  DROP CONSTRAINT IF EXISTS pedidos_wa_holded_invoice_doc_type_chk;

ALTER TABLE public.pedidos_wa
  ADD CONSTRAINT pedidos_wa_holded_invoice_doc_type_chk
  CHECK (holded_invoice_doc_type IS NULL OR holded_invoice_doc_type IN ('invoice', 'waybill'));

CREATE INDEX IF NOT EXISTS pedidos_wa_holded_invoice_id_idx
  ON public.pedidos_wa (holded_invoice_id)
  WHERE holded_invoice_id IS NOT NULL;
