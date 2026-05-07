-- Compras a proveedores (Alcalde, Abasthosur, ...) parseadas de PDF
-- Idempotencia: UNIQUE(proveedor, num_factura). RLS triple-rol estándar.

CREATE TABLE public.pedidos_wa_compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  proveedor_holded_id text NOT NULL REFERENCES public.manager_contactos(id),
  proveedor_nombre    text NOT NULL,
  num_factura         text NOT NULL,
  fecha               date NOT NULL,

  total_bruto numeric(12,2) NOT NULL,
  total_iva   numeric(12,2) NOT NULL,
  total       numeric(12,2) NOT NULL,
  iva_desglose jsonb,

  pdf_filename   text,
  raw_extraction jsonb,
  notas          text,

  -- Holded link (se rellena en Fase 3b)
  holded_purchase_id        text,
  holded_purchase_num       text,
  holded_purchase_created_at timestamptz,

  -- idempotencia adicional para proteger reintentos al POST a Holded
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (proveedor_holded_id, num_factura)
);

CREATE INDEX pedidos_wa_compras_fecha_idx     ON public.pedidos_wa_compras (fecha DESC);
CREATE INDEX pedidos_wa_compras_proveedor_idx ON public.pedidos_wa_compras (proveedor_holded_id, fecha DESC);

CREATE TABLE public.pedidos_wa_compras_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES public.pedidos_wa_compras(id) ON DELETE CASCADE,
  orden int NOT NULL,

  codigo_proveedor text,
  descripcion      text NOT NULL,
  cantidad         numeric(12,3) NOT NULL,
  unidad           text NOT NULL,
  precio_unitario  numeric(10,4) NOT NULL,
  iva_pct          numeric(5,2) NOT NULL,
  importe          numeric(12,2) NOT NULL,
  notas            text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pedidos_wa_compras_lineas_compra_idx
  ON public.pedidos_wa_compras_lineas (compra_id, orden);

-- Trigger updated_at en cabecera
CREATE OR REPLACE FUNCTION public.pedidos_wa_compras_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER pedidos_wa_compras_touch
  BEFORE UPDATE ON public.pedidos_wa_compras
  FOR EACH ROW EXECUTE FUNCTION public.pedidos_wa_compras_touch_updated();

-- RLS triple-rol
ALTER TABLE public.pedidos_wa_compras        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_wa_compras_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedidos_wa_compras: admin rw"
  ON public.pedidos_wa_compras
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "pedidos_wa_compras: responsable read"
  ON public.pedidos_wa_compras
  FOR SELECT TO authenticated
  USING (public.es_responsable());

CREATE POLICY "pedidos_wa_compras_lineas: admin rw"
  ON public.pedidos_wa_compras_lineas
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "pedidos_wa_compras_lineas: responsable read"
  ON public.pedidos_wa_compras_lineas
  FOR SELECT TO authenticated
  USING (public.es_responsable());
