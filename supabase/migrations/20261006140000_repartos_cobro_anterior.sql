-- Cierre del repartidor: cobros de deudas anteriores.
-- Una entrega fiada ya cuenta en el total el día del reparto (forma_pago
-- 'deuda'); cuando días después se cobra ("Diego anterior", "Brocales
-- anterior"…) volvía a sumar en Total reparto y en la productividad €/h.
-- Esas líneas se marcan ahora como cobro_anterior: siguen contando como dinero
-- real (efectivo/tarjeta, caja), pero no como reparto del periodo.

alter table public.repartos_jornada_lineas
  add column if not exists cobro_anterior boolean not null default false;

-- Histórico: solo líneas manuales (sin cliente enlazado) cuyo texto indica
-- claramente un cobro atrasado y en las que entró dinero. Las mixtas ("Azura hoy + anteriores") no se
-- pueden partir y quedan como reparto.
update public.repartos_jornada_lineas
   set cobro_anterior = true
 where contact_id is null
   and forma_pago <> 'deuda'
   and not cobro_anterior
   and contact_nombre ~* '(\manterior(es)?\M|\mayer\M|\mpendiente\M|\matrasad[oa]s?\M|\mdeudas?\M|\msemana\M|\mvencid[oa]\M|\md[ií]as? \d)'
   and contact_nombre !~* '\mhoy\M';

-- ── Cierre propio del empleado: conserva la marca ────────────────────────
CREATE OR REPLACE FUNCTION public.repartos_jornada_empleado_guardar(p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone, p_notas text, p_efectivo_billetes numeric, p_efectivo_monedas numeric, p_lineas jsonb, p_gastos jsonb)
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
  SELECT id, nombre INTO v_empleado_id, v_nombre
  FROM public.empleados_equipo
  WHERE user_id = auth.uid() AND activo = true
  LIMIT 1;
  IF v_empleado_id IS NULL THEN
    RAISE EXCEPTION 'no hay empleado activo vinculado a esta sesión';
  END IF;

  SELECT id INTO v_jornada_id
  FROM public.repartos_jornada
  WHERE empleado_id = v_empleado_id AND fecha = p_fecha AND origen = 'empleado';

  IF v_jornada_id IS NOT NULL THEN
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

  DELETE FROM public.repartos_jornada_lineas WHERE jornada_id = v_jornada_id;
  INSERT INTO public.repartos_jornada_lineas
    (jornada_id, contact_id, contact_nombre, importe, forma_pago, orden, cobro_anterior)
  SELECT v_jornada_id,
         NULLIF(l->>'contact_id',''),
         coalesce(l->>'contact_nombre',''),
         coalesce((l->>'importe')::numeric, 0),
         coalesce(l->>'forma_pago','efectivo'),
         coalesce((l->>'orden')::int, ord),
         coalesce((l->>'cobro_anterior')::boolean, false)
  FROM jsonb_array_elements(coalesce(p_lineas,'[]'::jsonb)) WITH ORDINALITY AS t(l, ord);

  DELETE FROM public.repartos_jornada_gastos WHERE jornada_id = v_jornada_id;
  INSERT INTO public.repartos_jornada_gastos
    (jornada_id, tipo, concepto, importe, orden, metodo_pago)
  SELECT v_jornada_id,
         coalesce(g->>'tipo','compras'),
         coalesce(g->>'concepto',''),
         coalesce((g->>'importe')::numeric, 0),
         coalesce((g->>'orden')::int, ord),
         coalesce(g->>'metodo_pago','efectivo')
  FROM jsonb_array_elements(coalesce(p_gastos,'[]'::jsonb)) WITH ORDINALITY AS t(g, ord);

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

-- ── Estadísticas: Total reparto sin cobros anteriores ───────────────────
-- Cambia el tipo de retorno (columna nueva), así que hay que recrearla.
DROP FUNCTION IF EXISTS public.cash_stats_semanas(date, date);

CREATE FUNCTION public.cash_stats_semanas(p_from date, p_to date)
 RETURNS TABLE(semana_inicio date, empleado_id uuid, empleado_nombre text, horas numeric, total numeric, efectivo numeric, gastos numeric, efectivo_neto numeric, monedas numeric, efectivo_neto_sin_monedas numeric, tarjeta numeric, deuda numeric, jornadas integer, cobros_anteriores numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with horas_fic as (
    select
      date_trunc('week', (f.ts_in at time zone 'Europe/Madrid'))::date as semana_inicio,
      f.empleado_id,
      sum(
        case
          when f.ts_out is not null
            then extract(epoch from (f.ts_out - f.ts_in)) / 3600.0
          else 0
        end
      ) as horas
    from public.trabajadores_fichajes f
    where (f.ts_in at time zone 'Europe/Madrid')::date between p_from and p_to
    group by 1, 2
  ),
  jor as (
    select
      date_trunc('week', j.fecha)::date as semana_inicio,
      j.empleado_id,
      count(*) as jornadas,
      coalesce(sum(j.efectivo_monedas), 0) as monedas
    from public.repartos_jornada j
    where j.fecha between p_from and p_to
    group by 1, 2
  ),
  lineas_jor as (
    select
      date_trunc('week', j.fecha)::date as semana_inicio,
      j.empleado_id,
      coalesce(sum(l.importe) filter (where not l.cobro_anterior), 0) as total,
      coalesce(sum(l.importe) filter (where l.cobro_anterior), 0) as cobros_anteriores,
      coalesce(sum(l.importe) filter (where l.forma_pago = 'efectivo'), 0) as efectivo,
      coalesce(sum(l.importe) filter (where l.forma_pago = 'tarjeta'),  0) as tarjeta,
      coalesce(sum(l.importe) filter (where l.forma_pago = 'deuda'),    0) as deuda
    from public.repartos_jornada j
    left join public.repartos_jornada_lineas l on l.jornada_id = j.id
    where j.fecha between p_from and p_to
    group by 1, 2
  ),
  gastos_jor as (
    select
      date_trunc('week', j.fecha)::date as semana_inicio,
      j.empleado_id,
      coalesce(sum(g.importe), 0) as gastos
    from public.repartos_jornada j
    join public.repartos_jornada_gastos g on g.jornada_id = j.id
    where j.fecha between p_from and p_to
      and g.metodo_pago = 'efectivo'
    group by 1, 2
  ),
  claves as (
    select semana_inicio, empleado_id from horas_fic
    union
    select semana_inicio, empleado_id from jor
  )
  select
    k.semana_inicio,
    k.empleado_id,
    e.nombre as empleado_nombre,
    coalesce(hf.horas, 0)    as horas,
    coalesce(li.total, 0)    as total,
    coalesce(li.efectivo, 0) as efectivo,
    coalesce(ga.gastos, 0)   as gastos,
    coalesce(li.efectivo, 0) - coalesce(ga.gastos, 0) as efectivo_neto,
    coalesce(j.monedas, 0)   as monedas,
    coalesce(li.efectivo, 0) - coalesce(ga.gastos, 0) - coalesce(j.monedas, 0) as efectivo_neto_sin_monedas,
    coalesce(li.tarjeta, 0)  as tarjeta,
    coalesce(li.deuda, 0)    as deuda,
    coalesce(j.jornadas, 0)::int as jornadas,
    coalesce(li.cobros_anteriores, 0) as cobros_anteriores
  from claves k
  join public.empleados e
    on e.id = k.empleado_id
   and e.incluir_productividad_reparto
  left join horas_fic  hf on hf.semana_inicio = k.semana_inicio and hf.empleado_id = k.empleado_id
  left join jor        j  on j.semana_inicio  = k.semana_inicio and j.empleado_id  = k.empleado_id
  left join lineas_jor li on li.semana_inicio = k.semana_inicio and li.empleado_id = k.empleado_id
  left join gastos_jor ga on ga.semana_inicio = k.semana_inicio and ga.empleado_id = k.empleado_id
  order by k.semana_inicio asc, e.nombre asc
$function$;

REVOKE ALL ON FUNCTION public.cash_stats_semanas(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_stats_semanas(date, date) TO authenticated, service_role;
