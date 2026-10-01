-- Gastos del cierre del repartidor: forma de pago.
-- Los chicos tienen tarjeta de empresa para las compras; esos gastos no salen
-- de la caja y no deben restar del efectivo. Lo existente queda como efectivo.

alter table public.repartos_jornada_gastos
  add column if not exists metodo_pago text not null default 'efectivo';

alter table public.repartos_jornada_gastos
  drop constraint if exists repartos_jornada_gastos_metodo_pago_check;
alter table public.repartos_jornada_gastos
  add constraint repartos_jornada_gastos_metodo_pago_check
  check (metodo_pago in ('efectivo', 'tarjeta'));

-- ── Cierre propio del empleado ───────────────────────────────────────────
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
    (jornada_id, contact_id, contact_nombre, importe, forma_pago, orden)
  SELECT v_jornada_id,
         NULLIF(l->>'contact_id',''),
         coalesce(l->>'contact_nombre',''),
         coalesce((l->>'importe')::numeric, 0),
         coalesce(l->>'forma_pago','efectivo'),
         coalesce((l->>'orden')::int, ord)
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

-- ── Edición de gastos por administración ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.repartos_jornada_gastos_guardar(p_jornada_id uuid, p_gastos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_revisado boolean;
begin
  if not is_admin() then
    raise exception 'solo administración puede editar gastos del cierre';
  end if;

  select revisado into v_revisado
  from public.repartos_jornada where id = p_jornada_id;
  if not found then
    raise exception 'jornada no encontrada';
  end if;

  -- Deshacer volcados previos antes de reemplazar las filas de gastos
  delete from public.gastos_variables
   where id in (
     select gasto_variable_id from public.repartos_jornada_gastos
      where jornada_id = p_jornada_id and gasto_variable_id is not null
   );
  delete from public.tesoreria_movimientos
   where jornada_id = p_jornada_id and fuente = 'cierre_repartidor';

  delete from public.repartos_jornada_gastos where jornada_id = p_jornada_id;

  insert into public.repartos_jornada_gastos (jornada_id, tipo, concepto, importe, orden, metodo_pago)
  select p_jornada_id,
         coalesce(g->>'tipo', 'compras'),
         coalesce(g->>'concepto', ''),
         coalesce((g->>'importe')::numeric, 0),
         coalesce((g->>'orden')::int, ord),
         coalesce(g->>'metodo_pago', 'efectivo')
  from jsonb_array_elements(coalesce(p_gastos, '[]'::jsonb)) with ordinality as t(g, ord);

  -- Si el cierre ya estaba aprobado, re-volcar para no dejar Tesorería desajustada
  if coalesce(v_revisado, false) then
    perform public.repartos_jornada_volcar_gastos(p_jornada_id);
  end if;
end;
$function$;

-- ── Volcado a gastos_variables: respeta la forma de pago ─────────────────
CREATE OR REPLACE FUNCTION public.repartos_jornada_volcar_gastos(p_jornada_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fecha       date;
  v_empleado_id uuid;
  v_nombre      text;
  v_admin       uuid := auth.uid();
  g             record;
  v_cat         uuid;
  v_gv_id       uuid;
begin
  select fecha, empleado_id into v_fecha, v_empleado_id
  from public.repartos_jornada where id = p_jornada_id;
  if not found then return; end if;

  select nombre into v_nombre
  from public.empleados_equipo where id = v_empleado_id;

  delete from public.gastos_variables
   where id in (
     select gasto_variable_id from public.repartos_jornada_gastos
      where jornada_id = p_jornada_id and gasto_variable_id is not null
   );
  delete from public.tesoreria_movimientos
   where jornada_id = p_jornada_id and fuente = 'cierre_repartidor';

  for g in
    select id, tipo, concepto, importe, metodo_pago
      from public.repartos_jornada_gastos
     where jornada_id = p_jornada_id and coalesce(importe, 0) > 0
     order by orden
  loop
    v_cat := case g.tipo
      when 'gasolina' then '284b8dac-2e9e-4442-b3b4-981f8808fe1e'::uuid
      else                 '0a9b7f6c-b062-4b8c-bceb-8d7456a624e1'::uuid
    end;

    insert into public.gastos_variables
      (fecha, categoria_id, subtotal, iva_pct, descripcion, metodo_pago, created_by)
    values
      (v_fecha, v_cat, g.importe, 0,
       'Ruta ' || coalesce(v_nombre, 'repartidor') || ' ' || to_char(v_fecha, 'DD/MM')
         || case when coalesce(g.concepto, '') <> '' then ' · ' || g.concepto else '' end,
       g.metodo_pago, v_admin)
    returning id into v_gv_id;

    update public.repartos_jornada_gastos
       set gasto_variable_id = v_gv_id
     where id = g.id;
  end loop;
end;
$function$;

-- ── Estadísticas: solo los gastos en efectivo restan del efectivo ────────
CREATE OR REPLACE FUNCTION public.cash_stats_semanas(p_from date, p_to date)
 RETURNS TABLE(semana_inicio date, empleado_id uuid, empleado_nombre text, horas numeric, total numeric, efectivo numeric, gastos numeric, efectivo_neto numeric, monedas numeric, efectivo_neto_sin_monedas numeric, tarjeta numeric, deuda numeric, jornadas integer)
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
      coalesce(sum(l.importe), 0) as total,
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
    coalesce(j.jornadas, 0)::int as jornadas
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
