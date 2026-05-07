-- ============================================================================
-- Trabajadores · Ruleta — flag global activar/desactivar
-- ============================================================================
-- Luis quiere poder activar/desactivar la ruleta para todo el equipo desde
-- la propia app. Default: OFF (Luis lo enciende cuando lo lance al equipo).
-- Backend hace defense-in-depth en ruleta_saldo_self() y ruleta_tirar().
-- ============================================================================

insert into public.app_settings (key, value)
values ('ruleta_activa', 'false')
on conflict (key) do nothing;


-- Helper público leer flag (cualquier authenticated)
create or replace function public.ruleta_is_activa()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select coalesce((select value::boolean from public.app_settings where key = 'ruleta_activa'), false);
$$;

grant execute on function public.ruleta_is_activa() to authenticated;


-- Setter (solo admin)
drop function if exists public.ruleta_activa_set(boolean);
create or replace function public.ruleta_activa_set(p_activa boolean)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo admin puede cambiar el estado de la ruleta';
  end if;
  insert into public.app_settings (key, value, updated_at)
    values ('ruleta_activa', p_activa::text, now())
  on conflict (key) do update
    set value = excluded.value, updated_at = now();
  return p_activa;
end;
$$;

grant execute on function public.ruleta_activa_set(boolean) to authenticated;


-- ruleta_saldo_self: respeta flag (devuelve 0 si OFF aunque haya tiradas)
drop function if exists public.ruleta_saldo_self();
create or replace function public.ruleta_saldo_self()
returns int
language sql security definer stable
set search_path = public
as $$
  select case
    when not coalesce((select value::boolean from public.app_settings where key = 'ruleta_activa'), false) then 0
    else coalesce(count(*), 0)::int
  end
  from public.trabajadores_ruleta_tiradas t
  join public.empleados e on e.id = t.empleado_id
  where e.user_id = auth.uid() and e.activo = true and t.premio_id is null;
$$;

grant execute on function public.ruleta_saldo_self() to authenticated;


-- ruleta_tirar: rechaza la tirada si flag OFF
drop function if exists public.ruleta_tirar();
create or replace function public.ruleta_tirar()
returns table (
  tirada_id    uuid,
  premio_id    uuid,
  premio_nombre text,
  premio_tipo  text,
  premio_valor numeric,
  premio_icono text,
  premio_color text,
  motivo       text
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_emp_id    uuid;
  v_tirada_id uuid;
  v_motivo    text;
  v_total_w   bigint;
  v_pick      bigint;
  v_premio_id uuid;
begin
  if not public.ruleta_is_activa() then
    raise exception 'La ruleta está desactivada';
  end if;

  select e.id into v_emp_id
  from public.empleados e
  where e.user_id = v_uid and e.activo = true
  limit 1;

  if v_emp_id is null then
    raise exception 'Tu cuenta no está vinculada a un empleado activo';
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

  select coalesce(sum(p.peso), 0) into v_total_w
  from public.trabajadores_ruleta_premios p where p.activo = true;

  if v_total_w = 0 then
    raise exception 'No hay premios disponibles. Avisa al admin.';
  end if;

  v_pick := floor(random() * v_total_w)::bigint;

  with ord as (
    select p.id, p.peso,
           sum(p.peso) over (order by p.created_at, p.id rows between unbounded preceding and current row) as acum
    from public.trabajadores_ruleta_premios p where p.activo = true
  )
  select ord.id into v_premio_id
  from ord
  where ord.acum > v_pick
  order by ord.acum asc
  limit 1;

  update public.trabajadores_ruleta_tiradas t
     set premio_id = v_premio_id,
         tirada_at = now()
   where t.id = v_tirada_id;

  return query
    select v_tirada_id,
           p.id, p.nombre, p.tipo, p.valor, p.icono, p.color,
           v_motivo
    from public.trabajadores_ruleta_premios p
    where p.id = v_premio_id;
end;
$$;

grant execute on function public.ruleta_tirar() to authenticated;
