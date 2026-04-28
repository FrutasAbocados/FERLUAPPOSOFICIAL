-- Módulo Control Deuda Abocados (cobros a clientes hostelería)
-- Sustituye Excel "Control Deuda Clientes" + pizarra física

CREATE TYPE cobros_forma_pago AS ENUM (
  'Contado',
  '1_dia',
  '7_dias',
  '30_dias',
  'Semanal_V',
  'Mensual_V'
);

CREATE TYPE cobros_metodo_cobro AS ENUM (
  'Efectivo',
  'Transferencia',
  'Bizum',
  'Otro'
);

CREATE TYPE cobros_tipo_movimiento AS ENUM (
  'Factura',
  'Pizarra'
);

-- ─── Clientes ───────────────────────────────────────────────────
CREATE TABLE cobros_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  forma_pago cobros_forma_pago NOT NULL DEFAULT 'Contado',
  metodo_cobro_preferido cobros_metodo_cobro,
  notas text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cobros_clientes_activo_idx ON cobros_clientes (activo);

-- ─── Movimientos (facturas + pizarra) ───────────────────────────
CREATE TABLE cobros_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES cobros_clientes(id) ON DELETE CASCADE,
  tipo cobros_tipo_movimiento NOT NULL,
  numero_factura text,
  fecha_factura date NOT NULL,
  importe numeric(10,2) NOT NULL CHECK (importe >= 0),
  pagado boolean NOT NULL DEFAULT false,
  fecha_cobro date,
  importe_cobrado numeric(10,2) CHECK (importe_cobrado IS NULL OR importe_cobrado >= 0),
  metodo_cobro cobros_metodo_cobro,
  fecha_vencimiento date NOT NULL,
  concepto text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotencia: misma factura del mismo cliente solo entra una vez
  CONSTRAINT cobros_movimientos_factura_unica
    UNIQUE NULLS NOT DISTINCT (cliente_id, numero_factura)
);

CREATE INDEX cobros_movimientos_cliente_idx ON cobros_movimientos (cliente_id);
CREATE INDEX cobros_movimientos_pagado_idx ON cobros_movimientos (pagado);
CREATE INDEX cobros_movimientos_fecha_venc_idx ON cobros_movimientos (fecha_vencimiento);
CREATE INDEX cobros_movimientos_fecha_factura_idx ON cobros_movimientos (fecha_factura);

-- ─── Trigger updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION cobros_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cobros_clientes_updated_at
  BEFORE UPDATE ON cobros_clientes
  FOR EACH ROW EXECUTE FUNCTION cobros_set_updated_at();

CREATE TRIGGER cobros_movimientos_updated_at
  BEFORE UPDATE ON cobros_movimientos
  FOR EACH ROW EXECUTE FUNCTION cobros_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────
-- Acceso: admin_full (Luis) + admin_op (Álvaro). Empleados NO ven nada.
ALTER TABLE cobros_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobros_movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY cobros_clientes_admin_all ON cobros_clientes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin_full', 'admin_op')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin_full', 'admin_op')
    )
  );

CREATE POLICY cobros_movimientos_admin_all ON cobros_movimientos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin_full', 'admin_op')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin_full', 'admin_op')
    )
  );
