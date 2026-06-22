-- Fix raíz: los premios de tipo 'puntos' se acreditaban SOLO cuando un admin
-- marcaba la tirada como entregada (ruleta_marcar_entregado). Si el admin no lo
-- hacía, el punto nunca entraba (se perdieron +25 de Alex el 22/06 y +50 de Adrián
-- en mayo). Ahora ruleta_tirar acredita el premio de puntos de forma atómica al
-- girar y marca la tirada como entregada en la misma transacción. Los premios
-- físicos/euros/comodín siguen pasando por la bandeja del admin sin cambios.

create or replace function public.ruleta_tirar()
 returns table(tirada_id uuid, premio_id uuid, premio_nombre text, premio_tipo text, premio_valor numeric, premio_icono text, premio_color text, motivo text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid           uuid := auth.uid();
  v_emp_id        uuid;
  v_tirada_id     uuid;
  v_motivo        text;
  v_total_w       bigint;
  v_pick          bigint;
  v_premio_id     uuid;
  v_premio_tipo   text;
  v_premio_valor  numeric;
  v_premio_nom    text;
  v_pity_threshold int := 8;
  v_forzar_pity   boolean := false;
begin
  if not public.ruleta_is_activa() then
    raise exception 'La ruleta esta desactivada';
  end if;

  select e.id into v_emp_id
  from public.empleados e
  where e.user_id = v_uid and e.activo = true
  limit 1;

  if v_emp_id is null then
    raise exception 'Tu cuenta no esta vinculada a un empleado activo';
  end if;

  select t.id, t.motivo into v_tirada_id, v_motivo
  from public.trabajadores_ruleta_tiradas t
  where t.empleado_id = v_emp_id and t.premio_id is null
  order by t.otorgado_at asc
  for update skip locked
  limit 1;

  if v_tirada_id is null then
    raise exception 'No tienes tiradas pendientes';
  end if;

  select coalesce(value::int, 8) into v_pity_threshold
  from public.app_settings where key = 'ruleta_pity_threshold';

  select count(*) filter (where p.garantizable) = 0 and count(*) >= v_pity_threshold
  into v_forzar_pity
  from (
    select p2.garantizable
    from public.trabajadores_ruleta_tiradas t2
    join public.trabajadores_ruleta_premios p2 on p2.id = t2.premio_id
    where t2.empleado_id = v_emp_id and t2.tirada_at is not null
    order by t2.tirada_at desc, t2.id desc
    limit v_pity_threshold
  ) p;

  if v_forzar_pity then
    select coalesce(sum(peso), 0) into v_total_w
    from public.trabajadores_ruleta_premios
    where activo = true and garantizable = true
      and (excluir_empleado_id is null or excluir_empleado_id is distinct from v_emp_id);
    if v_total_w = 0 then
      v_forzar_pity := false;
    end if;
  end if;

  if not v_forzar_pity then
    select coalesce(sum(peso), 0) into v_total_w
    from public.trabajadores_ruleta_premios
    where activo = true
      and (excluir_empleado_id is null or excluir_empleado_id is distinct from v_emp_id);
  end if;

  if v_total_w = 0 then
    raise exception 'No hay premios disponibles. Avisa al admin.';
  end if;

  v_pick := floor(random() * v_total_w)::bigint;

  if v_forzar_pity then
    with ord as (
      select p.id, p.peso,
             sum(p.peso) over (order by p.created_at, p.id rows between unbounded preceding and current row) as acum
      from public.trabajadores_ruleta_premios p
      where p.activo = true and p.garantizable = true
        and (p.excluir_empleado_id is null or p.excluir_empleado_id is distinct from v_emp_id)
    )
    select ord.id into v_premio_id from ord where ord.acum > v_pick order by ord.acum asc limit 1;
  else
    with ord as (
      select p.id, p.peso,
             sum(p.peso) over (order by p.created_at, p.id rows between unbounded preceding and current row) as acum
      from public.trabajadores_ruleta_premios p
      where p.activo = true
        and (p.excluir_empleado_id is null or p.excluir_empleado_id is distinct from v_emp_id)
    )
    select ord.id into v_premio_id from ord where ord.acum > v_pick order by ord.acum asc limit 1;
  end if;

  update public.trabajadores_ruleta_tiradas t
     set premio_id = v_premio_id,
         tirada_at = now()
   where t.id = v_tirada_id;

  -- Leer tipo/valor/nombre del premio
  select p.tipo, p.valor, p.nombre
    into v_premio_tipo, v_premio_valor, v_premio_nom
  from public.trabajadores_ruleta_premios p where p.id = v_premio_id;

  -- Si el premio es tipo 'bonus' -> insertar una tirada extra pendiente automaticamente
  if v_premio_tipo = 'bonus' then
    insert into public.trabajadores_ruleta_tiradas (empleado_id, motivo, otorgado_por)
    values (v_emp_id, 'Tirada extra (premio ruleta)', v_uid);
  end if;

  -- Premio de PUNTOS: acreditar de forma atomica al girar y marcar entregado.
  -- Evita que el punto dependa de la entrega manual del admin (causa de premios perdidos).
  if v_premio_tipo = 'puntos' and coalesce(v_premio_valor, 0) <> 0 then
    insert into public.trabajadores_puntos_ajustes (empleado_id, fecha, delta_pts, motivo, creado_por)
    values (
      v_emp_id,
      (now() at time zone 'Europe/Madrid')::date,
      v_premio_valor::smallint,
      'Ruleta: ' || v_premio_nom,
      v_uid
    );

    update public.trabajadores_ruleta_tiradas
       set entregado = true,
           entregado_at = now(),
           entregado_por = v_uid,
           solicitado_at = coalesce(solicitado_at, now())
     where id = v_tirada_id;
  end if;

  return query
    select v_tirada_id,
           p.id, p.nombre, p.tipo, p.valor, p.icono, p.color,
           case when v_forzar_pity then v_motivo || ' [suerte garantizada]' else v_motivo end
    from public.trabajadores_ruleta_premios p
    where p.id = v_premio_id;
end;
$function$;
