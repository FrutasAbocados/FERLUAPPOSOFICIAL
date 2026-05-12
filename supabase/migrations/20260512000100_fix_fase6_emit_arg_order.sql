-- Fix: las 3 funciones de fase6 tenían p_source y p_priority intercambiados.
-- Firma real: emit_event(event_type, payload, SOURCE, priority)
-- Las funciones originales pasaban: (event_type, payload, priority, source) → fallo en events_priority_check.

CREATE OR REPLACE FUNCTION ferlu_emit_caja_cierre_dia()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM emit_event(
    'ferlu.caja.cierre_dia',
    jsonb_build_object('fecha', NEW.fecha::text),
    'trigger:cierres',
    'high'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ferlu_emit_cobros_deuda_alta()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_nombre TEXT;
  v_total  NUMERIC;
  v_count  BIGINT;
BEGIN
  SELECT
    cc.nombre,
    COALESCE(SUM(cm.importe - COALESCE(cm.importe_cobrado, 0)), 0),
    COUNT(*)
  INTO v_nombre, v_total, v_count
  FROM cobros_clientes cc
  JOIN cobros_movimientos cm ON cm.cliente_id = cc.id
  WHERE cc.id = NEW.cliente_id AND cm.pagado = false
  GROUP BY cc.nombre;

  IF v_total > 1500 THEN
    PERFORM emit_event(
      'ferlu.cobros.deuda_alta',
      jsonb_build_object(
        'cliente_id',     NEW.cliente_id,
        'cliente_nombre', v_nombre,
        'deuda_total',    v_total,
        'num_facturas',   v_count
      ),
      'trigger:cobros_movimientos',
      'high'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION emit_audit_requested()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM emit_event(
    'ferlu.audit.requested',
    jsonb_build_object(
      'requested_at', now()::text,
      'requested_by', COALESCE(auth.uid()::text, 'system')
    ),
    'manual',
    'medium'
  );
END;
$$;
