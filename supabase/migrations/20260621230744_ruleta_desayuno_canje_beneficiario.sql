-- Desayunos a compañeros: el canjeable lo recibe el BENEFICIARIO (excluir_empleado_id),
-- no quien tira. Se notifica a ambos. excluir_empleado_id ya identifica al beneficiario.

-- 1) ruleta_premios_self: el desayuno aparece en la bandeja del beneficiario, no del que tira.
--    Nueva columna invita_nombre = nombre de quien le invita (solo en filas de desayuno).
drop function if exists public.ruleta_premios_self();
create function public.ruleta_premios_self()
 returns table(
   tirada_id uuid, empleado_id uuid, motivo text, otorgado_at timestamptz, tirada_at timestamptz,
   solicitado_at timestamptz, canje_notas text, entregado boolean, entregado_at timestamptz,
   premio_id uuid, premio_nombre text, premio_descripcion text, premio_tipo text,
   premio_valor numeric, premio_icono text, premio_color text, invita_nombre text)
 language sql stable security definer set search_path to 'public'
as $function$
  select
    t.id, t.empleado_id, t.motivo, t.otorgado_at, t.tirada_at, t.solicitado_at, t.canje_notas,
    t.entregado, t.entregado_at,
    p.id, p.nombre, p.descripcion, p.tipo, p.valor, p.icono, p.color,
    case when p.excluir_empleado_id is not null then spinner.nombre else null end as invita_nombre
  from public.trabajadores_ruleta_tiradas t
  join public.trabajadores_ruleta_premios p on p.id = t.premio_id
  join public.empleados spinner on spinner.id = t.empleado_id
  join public.empleados me on me.user_id = auth.uid() and me.activo = true
  where (
    -- premios normales: los ve quien tira
    (p.excluir_empleado_id is null and t.empleado_id = me.id)
    -- desayunos a compañero: los ve el beneficiario (= excluir_empleado_id)
    or (p.excluir_empleado_id = me.id)
  )
  order by
    t.entregado asc,
    t.solicitado_at desc nulls last,
    t.tirada_at desc nulls last,
    t.otorgado_at desc;
$function$;
revoke all on function public.ruleta_premios_self() from public, anon;
grant execute on function public.ruleta_premios_self() to authenticated;

-- 2) ruleta_solicitar_canje_self: el beneficiario de un desayuno también puede pedir el canje.
create or replace function public.ruleta_solicitar_canje_self(p_tirada uuid, p_nota text default null::text)
 returns table(tirada_id uuid, solicitado_at timestamptz)
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_emp_id uuid;
  v_solicitado_at timestamptz;
begin
  select e.id into v_emp_id
  from public.empleados e
  where e.user_id = v_uid and e.activo = true
  limit 1;

  if v_emp_id is null then
    raise exception 'Tu cuenta no está vinculada a un empleado activo';
  end if;

  update public.trabajadores_ruleta_tiradas t
     set solicitado_at = coalesce(t.solicitado_at, now()),
         solicitado_por = v_uid,
         canje_notas = nullif(trim(coalesce(p_nota, '')), '')
   from public.trabajadores_ruleta_premios p
   where t.id = p_tirada
     and p.id = t.premio_id
     and t.entregado = false
     and (
       -- premio normal: lo pide quien tiró
       (p.excluir_empleado_id is null and t.empleado_id = v_emp_id)
       -- desayuno: lo pide el beneficiario
       or (p.excluir_empleado_id = v_emp_id)
     )
  returning t.solicitado_at into v_solicitado_at;

  if v_solicitado_at is null then
    raise exception 'Premio no disponible para canjear';
  end if;

  return query select p_tirada, v_solicitado_at;
end;
$function$;
revoke all on function public.ruleta_solicitar_canje_self(uuid, text) from public, anon;
grant execute on function public.ruleta_solicitar_canje_self(uuid, text) to authenticated;

-- 3) Trigger: al asignarse un premio de desayuno a una tirada, notificar a ambos.
create or replace function public.ruleta_desayuno_notif_trigger()
 returns trigger
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_benef uuid;
  v_icono text;
  v_spinner_nom text;
  v_benef_nom text;
begin
  if new.premio_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.premio_id is not null then
    return new;  -- ya tenía premio, no re-notificar
  end if;

  select p.excluir_empleado_id, p.icono into v_benef, v_icono
  from public.trabajadores_ruleta_premios p
  where p.id = new.premio_id;

  if v_benef is null then
    return new;  -- no es un desayuno a compañero
  end if;

  select nombre into v_spinner_nom from public.empleados where id = new.empleado_id;
  select nombre into v_benef_nom   from public.empleados where id = v_benef;

  -- Notifica a quien tiró (le toca invitar)
  insert into public.notificaciones (audience, empleado_id, tipo, titulo, cuerpo, payload)
  values (
    'empleado', new.empleado_id, 'ruleta_desayuno',
    coalesce(v_icono, '🥐') || ' ¡Te toca invitar a desayunar!',
    'Le invitas el desayuno a ' || coalesce(v_benef_nom, 'un compañero') || '. ¡Que aproveche!',
    jsonb_build_object('tirada_id', new.id, 'premio_id', new.premio_id, 'rol', 'invita')
  );

  -- Notifica al beneficiario (recibe el desayuno y lo canjea)
  insert into public.notificaciones (audience, empleado_id, tipo, titulo, cuerpo, payload)
  values (
    'empleado', v_benef, 'ruleta_desayuno',
    coalesce(v_icono, '🥐') || ' ' || coalesce(v_spinner_nom, 'Un compañero') || ' te invita a desayunar',
    'Cánjealo cuando queráis desde "Mis premios".',
    jsonb_build_object('tirada_id', new.id, 'premio_id', new.premio_id, 'rol', 'beneficiario')
  );

  return new;
end;
$function$;

drop trigger if exists ruleta_desayuno_notif on public.trabajadores_ruleta_tiradas;
create trigger ruleta_desayuno_notif
  after insert or update of premio_id on public.trabajadores_ruleta_tiradas
  for each row execute function public.ruleta_desayuno_notif_trigger();
