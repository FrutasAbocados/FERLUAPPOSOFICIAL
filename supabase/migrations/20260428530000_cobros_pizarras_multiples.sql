-- Permitir múltiples movimientos tipo Pizarra del mismo cliente el mismo día
-- (las pizarras no tienen nº factura y antes chocaban por NULLS NOT DISTINCT).
-- Mantenemos idempotencia para FACTURAS via UNIQUE parcial (sólo cuando hay nº).

ALTER TABLE cobros_movimientos
  DROP CONSTRAINT IF EXISTS cobros_movimientos_factura_unica;

CREATE UNIQUE INDEX cobros_movimientos_factura_unica_idx
  ON cobros_movimientos (cliente_id, numero_factura, fecha_factura)
  WHERE numero_factura IS NOT NULL;
