-- El Excel real puede tener 2 facturas con el mismo número en distintas fechas
-- (rectificativas, abonos parciales). Relajamos la UNIQUE para incluir fecha_factura.

ALTER TABLE cobros_movimientos
  DROP CONSTRAINT IF EXISTS cobros_movimientos_factura_unica;

ALTER TABLE cobros_movimientos
  ADD CONSTRAINT cobros_movimientos_factura_unica
    UNIQUE NULLS NOT DISTINCT (cliente_id, numero_factura, fecha_factura);
