-- FASE 4.5 — Lote 2: triggers modo dual
-- notif_vacaciones_trigger + notif_puntos_trigger + notif_tareas_trigger + trab_credito_recalcular_total

-- ── 1. notif_vacaciones_trigger ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notif_vacaciones_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp_nombre text;
  v_rango      text;
BEGIN
  SELECT nombre INTO v_emp_nombre FROM public.empleados WHERE id = new.empleado_id;
  v_rango := to_char(new.fecha_inicio, 'DD/MM/YYYY') ||
             ' → ' || to_char(new.fecha_fin, 'DD/MM/YYYY') ||
             ' (' || new.dias || 'd)';

  IF tg_op = 'INSERT' AND new.estado = 'pendiente' THEN
    PERFORM public.notif_emit(
      'admin', null, 'vacaciones_solicitada',
      'Solicitud de vacaciones — ' || coalesce(v_emp_nombre, '?'),
      v_rango || coalesce(' · ' || nullif(new.nota, ''), ''),
      jsonb_build_object('vacacion_id', new.id, 'empleado_id', new.empleado_id)
    );
  END IF;

  IF tg_op = 'UPDATE' AND new.estado IS DISTINCT FROM old.estado THEN
    IF new.estado = 'aprobado' THEN
      PERFORM public.notif_emit(
        'empleado', new.empleado_id, 'vacaciones_aprobada',
        '✅ Vacaciones aprobadas',
        v_rango,
        jsonb_build_object('vacacion_id', new.id)
      );
    ELSIF new.estado = 'denegado' THEN
      PERFORM public.notif_emit(
        'empleado', new.empleado_id, 'vacaciones_denegada',
        '❌ Vacaciones denegadas',
        v_rango || coalesce(' · ' || nullif(new.nota, ''), ''),
        jsonb_build_object('vacacion_id', new.id)
      );
    END IF;
  END IF;

  -- ── Evento al bus ──────────────────────────────────────────────────────────
  PERFORM emit_event(
    'ferlu.trabajador.vacaciones_actualizadas',
    jsonb_build_object(
      'empleado_id',  new.empleado_id,
      'fecha_inicio', new.fecha_inicio::text,
      'fecha_fin',    new.fecha_fin::text,
      'estado',       new.estado,
      'operacion',    tg_op
    ),
    'trabajadores_vacaciones',
    'low'
  );

  RETURN new;
END;
$$;

-- ── 2. notif_puntos_trigger ───────────────────────────────────────────────────
-- (versión actualizada de 20260505040000 + evento al bus)
CREATE OR REPLACE FUNCTION public.notif_puntos_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_titulo text;
  v_cuerpo text;
  v_notas  text;
BEGIN
  DELETE FROM public.notificaciones
   WHERE audience = 'empleado'
     AND empleado_id = new.empleado_id
     AND tipo = 'puntos_dia'
     AND (payload->>'fecha')::date = new.fecha;

  v_notas := nullif(
    array_to_string(
      array_remove(ARRAY[
        nullif(trim(new.nota_puntualidad),     ''),
        nullif(trim(new.nota_reparto),         ''),
        nullif(trim(new.nota_responsabilidad), '')
      ], null),
      ' | '
    ),
    ''
  );
  IF v_notas IS NULL THEN
    v_notas := nullif(trim(new.nota), '');
  END IF;

  -- ── Evento al bus (siempre, incluso total=0 para registrar el borrado) ─────
  PERFORM emit_event(
    'ferlu.trabajador.puntos_actualizados',
    jsonb_build_object(
      'empleado_id', new.empleado_id,
      'fecha',       new.fecha::text,
      'puntos',      new.total,
      'motivo',      v_notas,
      'operacion',   tg_op
    ),
    'trabajadores_puntos_dias',
    'low'
  );

  IF new.total = 0 THEN RETURN new; END IF;

  v_titulo := '⭐ ' || new.total || ' puntos hoy';
  v_cuerpo := 'Puntualidad ' || new.puntualidad ||
              ' · Reparto ' || new.reparto ||
              ' · Responsabilidad ' || new.responsabilidad ||
              coalesce(' · ' || v_notas, '');

  PERFORM public.notif_emit(
    'empleado', new.empleado_id, 'puntos_dia',
    v_titulo, v_cuerpo,
    jsonb_build_object('fecha', new.fecha, 'total', new.total)
  );
  RETURN new;
END;
$$;

-- ── 3. notif_tareas_trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notif_tareas_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp text;
BEGIN
  -- ── Evento al bus: siempre que cambie estado ───────────────────────────────
  PERFORM emit_event(
    CASE tg_op WHEN 'INSERT' THEN 'ferlu.tarea.creada' ELSE 'ferlu.tarea.actualizada' END,
    jsonb_build_object(
      'tarea_id',   new.id,
      'titulo',     new.titulo,
      'estado',     new.estado::text,
      'asignado_a', new.asignado_a,
      'completada', (new.estado = 'hecha'::public.tarea_estado),
      'operacion',  tg_op
    ),
    'tareas',
    'low'
  );

  -- ── Notif interna: solo cuando empleado marca como 'hecha' ────────────────
  IF new.estado <> 'hecha'::public.tarea_estado THEN RETURN new; END IF;
  IF tg_op = 'UPDATE' AND old.estado = 'hecha'::public.tarea_estado THEN RETURN new; END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin_full', 'admin_op', 'responsable')
  ) THEN
    RETURN new;
  END IF;

  IF new.asignado_a IS NOT NULL THEN
    SELECT nombre INTO v_emp FROM public.empleados WHERE id = new.asignado_a;
  END IF;

  PERFORM public.notif_emit(
    'admin', null, 'tarea_completada',
    '✔️ Tarea completada',
    new.titulo || coalesce(' — ' || v_emp, ''),
    jsonb_build_object('tarea_id', new.id, 'asignado_a', new.asignado_a)
  );
  RETURN new;
END;
$$;

-- ── 4. trab_credito_recalcular_total ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trab_credito_recalcular_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_factura     uuid;
  v_empleado_id uuid;
  v_nuevo_total numeric;
BEGIN
  v_factura := coalesce(new.factura_id, old.factura_id);

  UPDATE public.trabajadores_credito_facturas f
     SET total = coalesce((
           SELECT sum(subtotal)
             FROM public.trabajadores_credito_lineas l
            WHERE l.factura_id = v_factura
         ), 0)
   WHERE f.id = v_factura;

  -- ── Evento al bus con el total recalculado ────────────────────────────────
  SELECT empleado_id, total INTO v_empleado_id, v_nuevo_total
    FROM public.trabajadores_credito_facturas
   WHERE id = v_factura;

  PERFORM emit_event(
    'ferlu.trabajador.credito_actualizado',
    jsonb_build_object(
      'empleado_id',   v_empleado_id,
      'credito_total', v_nuevo_total,
      'operacion',     tg_op
    ),
    'trabajadores_credito_lineas',
    'low'
  );

  RETURN null;
END;
$$;
