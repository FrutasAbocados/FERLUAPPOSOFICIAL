-- El repartidor no declara billetes/monedas desde su cierre propio: el frontend
-- envía NULL en p_efectivo_billetes / p_efectivo_monedas. Sin el coalesce, un
-- reenvío del cierre borraba las monedas que administración ya había apuntado
-- sobre esa misma jornada (mientras no esté revisada).
CREATE OR REPLACE FUNCTION public.repartos_jornada_empleado_guardar(
  p_fecha date,
  p_hora_inicio time without time zone,
  p_hora_fin time without time zone,
  p_notas text,
  p_efectivo_billetes numeric,
  p_efectivo_monedas numeric,
  p_lineas jsonb,
  p_gastos jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_empleado_id uuid;
  v_jornada_id  uuid;
  v_nombre      text;
BEGIN
  -- Empleado dueño de la sesión (ignora cualquier id del cliente → no falseable)
  SELECT id, nombre INTO v_empleado_id, v_nombre
  FROM public.empleados_equipo
  WHERE user_id = auth.uid() AND activo = true
  LIMIT 1;
  IF v_empleado_id IS NULL THEN
    RAISE EXCEPTION 'no hay empleado activo vinculado a esta sesión';
  END IF;

  -- ¿Existe ya el autocierre del día?
  SELECT id INTO v_jornada_id
  FROM public.repartos_jornada
  WHERE empleado_id = v_empleado_id AND fecha = p_fecha AND origen = 'empleado';

  IF v_jornada_id IS NOT NULL THEN
    -- Bloqueo: una vez aprobado por admin, el empleado no puede modificar
    IF (SELECT revisado FROM public.repartos_jornada WHERE id = v_jornada_id) THEN
      RAISE EXCEPTION 'el cierre ya fue revisado por administración y no se puede modificar';
    END IF;
    UPDATE public.repartos_jornada
       SET hora_inicio = p_hora_inicio,
           hora_fin    = p_hora_fin,
           notas       = p_notas,
           efectivo_billetes = coalesce(p_efectivo_billetes, efectivo_billetes),
           efectivo_monedas  = coalesce(p_efectivo_monedas, efectivo_monedas),
           enviado_at  = now(),
           updated_at  = now()
     WHERE id = v_jornada_id;
  ELSE
    INSERT INTO public.repartos_jornada
      (fecha, empleado_id, hora_inicio, hora_fin, notas,
       efectivo_billetes, efectivo_monedas, origen, enviado_at, created_by)
    VALUES
      (p_fecha, v_empleado_id, p_hora_inicio, p_hora_fin, p_notas,
       p_efectivo_billetes, p_efectivo_monedas, 'empleado', now(), auth.uid())
    RETURNING id INTO v_jornada_id;
  END IF;

  -- Reemplazar líneas (repartos)
  DELETE FROM public.repartos_jornada_lineas WHERE jornada_id = v_jornada_id;
  INSERT INTO public.repartos_jornada_lineas
    (jornada_id, contact_id, contact_nombre, importe, forma_pago, orden)
  SELECT v_jornada_id,
         NULLIF(l->>'contact_id','')::uuid,
         coalesce(l->>'contact_nombre',''),
         coalesce((l->>'importe')::numeric, 0),
         coalesce(l->>'forma_pago','efectivo'),
         coalesce((l->>'orden')::int, ord)
  FROM jsonb_array_elements(coalesce(p_lineas,'[]'::jsonb)) WITH ORDINALITY AS t(l, ord);

  -- Reemplazar gastos
  DELETE FROM public.repartos_jornada_gastos WHERE jornada_id = v_jornada_id;
  INSERT INTO public.repartos_jornada_gastos
    (jornada_id, tipo, concepto, importe, orden)
  SELECT v_jornada_id,
         coalesce(g->>'tipo','compras'),
         coalesce(g->>'concepto',''),
         coalesce((g->>'importe')::numeric, 0),
         coalesce((g->>'orden')::int, ord)
  FROM jsonb_array_elements(coalesce(p_gastos,'[]'::jsonb)) WITH ORDINALITY AS t(g, ord);

  -- Avisar a administración (push automático vía tabla notificaciones)
  INSERT INTO public.notificaciones
    (audience, empleado_id, tipo, titulo, cuerpo, payload, expires_at)
  VALUES
    ('admin', v_empleado_id, 'cierre_enviado',
     '📋 Cierre de ' || coalesce(v_nombre,'repartidor'),
     'Envió su cierre del ' || to_char(p_fecha,'DD/MM') || ' · pendiente de revisar',
     jsonb_build_object('jornada_id', v_jornada_id, 'fecha', p_fecha, 'empleado', v_nombre),
     now() + interval '7 days');

  RETURN v_jornada_id;
END;
$function$;
