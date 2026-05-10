-- Fase 6.8 — Event types nuevos: caja.cierre_dia · cobros.deuda_alta · audit.requested

-- ─── 1. ferlu.caja.cierre_dia ─────────────────────────────────────────────────
-- Dispara cuando se inserta un cierre de día en la tabla cierres.
-- El FinanceAgent genera un resumen diario y lo manda por Telegram.

CREATE OR REPLACE FUNCTION ferlu_emit_caja_cierre_dia()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM emit_event(
    'ferlu.caja.cierre_dia',
    jsonb_build_object('fecha', NEW.fecha::text),
    'high',
    'trigger:cierres'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cierres_emit_cierre_dia ON cierres;
CREATE TRIGGER cierres_emit_cierre_dia
  AFTER INSERT ON cierres
  FOR EACH ROW
  EXECUTE FUNCTION ferlu_emit_caja_cierre_dia();

-- ─── 2. ferlu.cobros.deuda_alta ───────────────────────────────────────────────
-- Dispara cuando se inserta o actualiza un movimiento de cobros y la deuda
-- total del cliente supera 1.500€. El FinanceAgent envía alerta Telegram.

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
      'high',
      'trigger:cobros_movimientos'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cobros_emit_deuda_alta ON cobros_movimientos;
CREATE TRIGGER cobros_emit_deuda_alta
  AFTER INSERT OR UPDATE ON cobros_movimientos
  FOR EACH ROW
  EXECUTE FUNCTION ferlu_emit_cobros_deuda_alta();

-- ─── 3. ferlu.audit.requested — RPC manual ────────────────────────────────────
-- Llamada desde Centro Control o directamente por Luis.
-- El AuditAgent corre los health checks y manda informe por Telegram.

CREATE OR REPLACE FUNCTION emit_audit_requested()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM emit_event(
    'ferlu.audit.requested',
    jsonb_build_object(
      'requested_at', now()::text,
      'requested_by', COALESCE(auth.uid()::text, 'system')
    ),
    'medium',
    'manual'
  );
END;
$$;
