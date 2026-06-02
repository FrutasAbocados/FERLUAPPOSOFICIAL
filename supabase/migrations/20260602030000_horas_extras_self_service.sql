-- Horas extras self-service: el trabajador solicita, el admin aprueba/rechaza y liquida.
-- Eje nuevo "aprobacion" (solicitado/aprobado/rechazado) independiente del "estado" de liquidacion.
-- Aplicada en produccion via MCP apply_migration (2026-06-02). Versionada aqui para el repo.

-- 1) Esquema --------------------------------------------------------------
alter table public.trabajadores_horas_extras
  alter column modo drop not null;

alter table public.trabajadores_horas_extras
  add column if not exists aprobacion text not null default 'aprobado'
    check (aprobacion in ('solicitado','aprobado','rechazado')),
  add column if not exists revisado_por uuid,
  add column if not exists revisado_at timestamptz,
  add column if not exists motivo_rechazo text;

-- (Las filas previas heredan aprobacion='aprobado' por el default -> siguen contando igual.)

-- 2) RPC: el trabajador solicita ------------------------------------------
create or replace function public.trabajadores_horas_extras_solicitar(
  p_fecha date,
  p_horas numeric,
  p_motivo text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_emp    uuid;
  v_nombre text;
  v_id     uuid;
begin
  select e.id, e.nombre into v_emp, v_nombre
  from public.empleados e
  where e.user_id = auth.uid() and e.activo = true
  limit 1;

  if v_emp is null then
    raise exception 'Tu usuario no está vinculado a un empleado activo' using errcode = '42501';
  end if;

  if p_horas is null or p_horas <= 0 then
    raise exception 'Las horas deben ser mayores que 0' using errcode = '22023';
  end if;

  insert into public.trabajadores_horas_extras
    (empleado_id, fecha, horas, modo, estado, aprobacion, motivo, creado_por)
  values
    (v_emp, p_fecha, p_horas, null, 'pendiente', 'solicitado', nullif(trim(p_motivo), ''), auth.uid())
  returning id into v_id;

  -- Aviso push al admin (insertar en notificaciones dispara push por trigger).
  insert into public.notificaciones (audience, empleado_id, tipo, titulo, cuerpo, payload)
  values (
    'admin', v_emp, 'horas_extras',
    'Nueva petición de horas extras',
    coalesce(v_nombre, 'Un trabajador') || ': ' || trim(to_char(p_horas, 'FM999990.0')) || ' h · ' ||
      to_char(p_fecha, 'DD/MM'),
    jsonb_build_object('url', '/trabajadores?tab=horas_extras', 'empleado_id', v_emp, 'he_id', v_id)
  );

  return v_id;
end;
$function$;

-- 3) RPC: el trabajador anula su propia solicitud (solo si aún 'solicitado') ----
create or replace function public.trabajadores_horas_extras_cancelar_propia(
  p_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_emp uuid;
begin
  select e.id into v_emp
  from public.empleados e
  where e.user_id = auth.uid() and e.activo = true
  limit 1;

  if v_emp is null then
    raise exception 'Tu usuario no está vinculado a un empleado activo' using errcode = '42501';
  end if;

  delete from public.trabajadores_horas_extras
  where id = p_id
    and empleado_id = v_emp
    and aprobacion = 'solicitado';

  if not found then
    raise exception 'No se puede anular: la petición no existe o ya fue resuelta' using errcode = '42501';
  end if;
end;
$function$;

-- 4) RPC: el admin aprueba (asigna compensación) o rechaza --------------------
create or replace function public.trabajadores_horas_extras_resolver(
  p_id uuid,
  p_aprobar boolean,
  p_modo text default null,
  p_motivo_rechazo text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_emp    uuid;
  v_horas  numeric;
  v_fecha  date;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede resolver peticiones' using errcode = '42501';
  end if;

  select empleado_id, horas, fecha into v_emp, v_horas, v_fecha
  from public.trabajadores_horas_extras
  where id = p_id and aprobacion = 'solicitado';

  if v_emp is null then
    raise exception 'La petición no existe o ya fue resuelta' using errcode = '42704';
  end if;

  if p_aprobar then
    if coalesce(p_modo, '') not in ('pago','horas','dias_vac') then
      raise exception 'Compensación inválida (pago | horas | dias_vac)' using errcode = '22023';
    end if;

    update public.trabajadores_horas_extras
    set modo = p_modo,
        aprobacion = 'aprobado',
        revisado_por = auth.uid(),
        revisado_at = now()
    where id = p_id;

    insert into public.notificaciones (audience, empleado_id, tipo, titulo, cuerpo, payload)
    values (
      'empleado', v_emp, 'horas_extras',
      'Horas extras aprobadas',
      trim(to_char(v_horas, 'FM999990.0')) || ' h del ' || to_char(v_fecha, 'DD/MM') || ' aprobadas · ' ||
        case p_modo when 'pago' then 'pago 10€/h' when 'horas' then 'horas libres' else 'días de vacaciones' end,
      jsonb_build_object('url', '/trabajadores?tab=horas_extras', 'he_id', p_id)
    );
  else
    update public.trabajadores_horas_extras
    set aprobacion = 'rechazado',
        motivo_rechazo = nullif(trim(p_motivo_rechazo), ''),
        revisado_por = auth.uid(),
        revisado_at = now()
    where id = p_id;

    insert into public.notificaciones (audience, empleado_id, tipo, titulo, cuerpo, payload)
    values (
      'empleado', v_emp, 'horas_extras',
      'Petición de horas extras rechazada',
      trim(to_char(v_horas, 'FM999990.0')) || ' h del ' || to_char(v_fecha, 'DD/MM') || ' rechazadas'
        || coalesce(' · ' || nullif(trim(p_motivo_rechazo), ''), ''),
      jsonb_build_object('url', '/trabajadores?tab=horas_extras', 'he_id', p_id)
    );
  end if;
end;
$function$;

revoke execute on function public.trabajadores_horas_extras_solicitar(date,numeric,text) from anon;
revoke execute on function public.trabajadores_horas_extras_cancelar_propia(uuid) from anon;
revoke execute on function public.trabajadores_horas_extras_resolver(uuid,boolean,text,text) from anon;

-- 5) Resumen del mes: solo cuentan las aprobadas -----------------------------
create or replace function public.trabajadores_horas_extras_resumen_mes(p_mes date default current_date)
 returns table(empleado_id uuid, nombre text, horas_pago_pendientes numeric, horas_pago_liquidadas numeric, importe_pago_pendiente numeric, importe_pago_liquidado numeric, horas_compensadas_pend numeric, horas_compensadas_liq numeric, dias_vac_pendientes numeric, dias_vac_liquidados numeric)
 language sql
 stable
 set search_path to 'public'
as $function$
  with rng as (
    select date_trunc('month', p_mes)::date                            as inicio,
           (date_trunc('month', p_mes) + interval '1 month')::date     as fin
  ),
  agg as (
    select
      h.empleado_id,
      coalesce(sum(h.horas) filter (where h.modo='pago'     and h.estado='pendiente'),  0) as horas_pago_pendientes,
      coalesce(sum(h.horas) filter (where h.modo='pago'     and h.estado='liquidado'),  0) as horas_pago_liquidadas,
      coalesce(sum(h.horas) filter (where h.modo='horas'    and h.estado='pendiente'),  0) as horas_compensadas_pend,
      coalesce(sum(h.horas) filter (where h.modo='horas'    and h.estado='liquidado'),  0) as horas_compensadas_liq,
      coalesce(sum(h.horas) filter (where h.modo='dias_vac' and h.estado='pendiente'),  0) as horas_dvp,
      coalesce(sum(h.horas) filter (where h.modo='dias_vac' and h.estado='liquidado'),  0) as horas_dvl
    from public.trabajadores_horas_extras h
    cross join rng
    where h.fecha >= rng.inicio and h.fecha < rng.fin
      and h.aprobacion = 'aprobado'
    group by h.empleado_id
  )
  select
    e.id                                     as empleado_id,
    e.nombre,
    coalesce(agg.horas_pago_pendientes, 0)   as horas_pago_pendientes,
    coalesce(agg.horas_pago_liquidadas, 0)   as horas_pago_liquidadas,
    round(coalesce(agg.horas_pago_pendientes, 0) * 10, 2) as importe_pago_pendiente,
    round(coalesce(agg.horas_pago_liquidadas, 0) * 10, 2) as importe_pago_liquidado,
    coalesce(agg.horas_compensadas_pend, 0)  as horas_compensadas_pend,
    coalesce(agg.horas_compensadas_liq,  0)  as horas_compensadas_liq,
    round(coalesce(agg.horas_dvp, 0) / 7.0, 2) as dias_vac_pendientes,
    round(coalesce(agg.horas_dvl, 0) / 7.0, 2) as dias_vac_liquidados
  from public.empleados e
  left join agg on agg.empleado_id = e.id
  where e.activo = true
  order by e.nombre;
$function$;

-- 6) Lista del mes: añade aprobacion + motivo_rechazo y filtro por aprobacion ----
drop function if exists public.trabajadores_horas_extras_lista_mes(date, uuid);
create or replace function public.trabajadores_horas_extras_lista_mes(
  p_mes date default current_date,
  p_empleado uuid default null,
  p_aprobacion text default null
)
 returns table(id uuid, empleado_id uuid, empleado_nombre text, fecha date, horas numeric, modo text, estado text, aprobacion text, motivo text, motivo_rechazo text, fecha_liquidado date, importe_eur numeric, dias_vac_eq numeric, created_at timestamp with time zone)
 language sql
 stable
 set search_path to 'public'
as $function$
  with rng as (
    select date_trunc('month', p_mes)::date                            as inicio,
           (date_trunc('month', p_mes) + interval '1 month')::date     as fin
  )
  select
    h.id,
    h.empleado_id,
    e.nombre as empleado_nombre,
    h.fecha,
    h.horas,
    h.modo,
    h.estado,
    h.aprobacion,
    h.motivo,
    h.motivo_rechazo,
    h.fecha_liquidado,
    case when h.modo = 'pago'     then round(h.horas * 10, 2)   else 0::numeric end as importe_eur,
    case when h.modo = 'dias_vac' then round(h.horas / 7.0, 2)  else 0::numeric end as dias_vac_eq,
    h.created_at
  from public.trabajadores_horas_extras h
  cross join rng
  left join public.empleados e on e.id = h.empleado_id
  where h.fecha >= rng.inicio and h.fecha < rng.fin
    and (p_empleado is null or h.empleado_id = p_empleado)
    and (p_aprobacion is null or h.aprobacion = p_aprobacion)
  order by h.fecha desc, h.created_at desc;
$function$;

revoke execute on function public.trabajadores_horas_extras_lista_mes(date,uuid,text) from anon;
revoke execute on function public.trabajadores_horas_extras_resumen_mes(date) from anon;
