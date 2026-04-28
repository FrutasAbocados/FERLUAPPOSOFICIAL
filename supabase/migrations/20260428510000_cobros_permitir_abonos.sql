-- Permite importes negativos para abonos / notas de crédito.
-- Mantiene el guard contra valores absurdamente grandes.

ALTER TABLE cobros_movimientos
  DROP CONSTRAINT IF EXISTS cobros_movimientos_importe_check;

ALTER TABLE cobros_movimientos
  DROP CONSTRAINT IF EXISTS cobros_movimientos_importe_cobrado_check;
