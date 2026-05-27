-- ============================================================================
-- Ruleta · Actualizar valores de canje
--   1 ticket  →  12 pts (antes 15)
--   5 tickets →  55 pts (nuevo)
--   10 tickets → 100 pts (sin cambio)
-- ============================================================================

-- 1. Quitar constraints viejos primero (necesario para poder hacer el UPDATE)
alter table public.trabajadores_ruleta_canjes
  drop constraint if exists trabajadores_ruleta_canjes_puntos_gastados_check;

alter table public.trabajadores_ruleta_canjes
  drop constraint if exists trabajadores_ruleta_canjes_tiradas_creadas_check;

-- 2. Normalizar registros históricos con valor antiguo (15 → 12)
update public.trabajadores_ruleta_canjes
  set puntos_gastados = 12
  where puntos_gastados = 15 and tiradas_creadas = 1;

-- 3. Añadir nuevos constraints
alter table public.trabajadores_ruleta_canjes
  add constraint trabajadores_ruleta_canjes_puntos_gastados_check
    check (puntos_gastados in (12, 55, 100));

alter table public.trabajadores_ruleta_canjes
  add constraint trabajadores_ruleta_canjes_tiradas_creadas_check
    check (tiradas_creadas in (1, 5, 10));


-- 4. ruleta_self_estado: añadir puede_canjear_5, umbrales 12/55/100
drop function if exists public.ruleta_self_estado();
create or replace function public.ruleta_self_estado()
returns table (
  empleado_id         uuid,
  nombre              text,
  activa              boolean,
  es_sabado           boolean,
  saldo_pendiente     int,
  puntos_disponibles  int,
  puede_canjear_1     boolean,
  puede_canjear_5     boolean,
  puede_canjear_10    boolean
)
language sql security definer stable
set search_path = public
as $$
  with emp as (
    select e.id, e.nombre
    from public.empleados e
    where e.user_id = auth.uid() and e.activo = true
    limit 1
  ),
  ctx as (
    select
      (now() at time zone 'Europe/Madrid')::date as hoy,
      date_trunc('month', (now() at time zone 'Europe/Madrid')::date)::date as inicio,
      (date_trunc('month', (now() at time zone 'Europe/Madrid')::date) + interval '1 month')::date as fin,
      public.ruleta_is_activa() as activa,
      public.ruleta_es_sabado_madrid(now()) as es_sabado
  ),
  puntos as (
    select
      emp.id as empleado_id,
      coalesce(sum(d.total), 0)::int as pts_base
    from emp
    cross join ctx
    left join public.trabajadores_puntos_dias d
      on d.empleado_id = emp.id
     and d.fecha >= ctx.inicio
     and d.fecha < ctx.fin
    group by emp.id
  ),
  ajustes as (
    select emp.id as empleado_id, coalesce(sum(a.delta_pts), 0)::int as pts_ajustes
    from emp
    cross join ctx
    left join public.trabajadores_puntos_ajustes a
      on a.empleado_id = emp.id
     and a.fecha >= ctx.inicio
     and a.fecha < ctx.fin
    group by emp.id
  ),
  canjes as (
    select emp.id as empleado_id, coalesce(sum(c.puntos_gastados), 0)::int as pts_canjeados
    from emp
    cross join ctx
    left join public.trabajadores_ruleta_canjes c
      on c.empleado_id = emp.id
     and c.fecha >= ctx.inicio
     and c.fecha < ctx.fin
    group by emp.id
  ),
  saldo as (
    select emp.id as empleado_id, coalesce(count(t.id), 0)::int as saldo_pendiente
    from emp
    left join public.trabajadores_ruleta_tiradas t
      on t.empleado_id = emp.id and t.premio_id is null
    group by emp.id
  ),
  disponible as (
    select
      emp.id as empleado_id,
      greatest(coalesce(p.pts_base, 0) + coalesce(a.pts_ajustes, 0) - coalesce(c.pts_canjeados, 0), 0)::int as puntos
    from emp
    left join puntos p on p.empleado_id = emp.id
    left join ajustes a on a.empleado_id = emp.id
    left join canjes c on c.empleado_id = emp.id
  )
  select
    emp.id,
    emp.nombre,
    ctx.activa,
    ctx.es_sabado,
    case when ctx.activa and ctx.es_sabado then coalesce(s.saldo_pendiente, 0) else 0 end as saldo_pendiente,
    coalesce(d.puntos, 0) as puntos_disponibles,
    (ctx.activa and ctx.es_sabado and coalesce(d.puntos, 0) >= 12)  as puede_canjear_1,
    (ctx.activa and ctx.es_sabado and coalesce(d.puntos, 0) >= 55)  as puede_canjear_5,
    (ctx.activa and ctx.es_sabado and coalesce(d.puntos, 0) >= 100) as puede_canjear_10
  from emp
  cross join ctx
  left join saldo s on s.empleado_id = emp.id
  left join disponible d on d.empleado_id = emp.id;
$$;

grant execute on function public.ruleta_self_estado() to authenticated;


-- 5. ruleta_canjear_self: soportar p_tiradas in (1, 5, 10)
drop function if exists public.ruleta_canjear_self(int);
create or replace function public.ruleta_canjear_self(p_tiradas int)
returns table (
  tiradas_creadas     int,
  puntos_gastados     int,
  puntos_disponibles  int,
  saldo_pendiente     int
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emp_id uuid;
  v_coste int;
  v_disponibles int;
  v_saldo int;
  i int;
begin
  if not public.ruleta_is_activa() then
    raise exception 'La ruleta esta desactivada';
  end if;

  if not public.ruleta_es_sabado_madrid(now()) then
    raise exception 'La ruleta solo se puede canjear los sabados';
  end if;

  if p_tiradas not in (1, 5, 10) then
    raise exception 'Canje no valido';
  end if;

  v_coste := case
    when p_tiradas = 10 then 100
    when p_tiradas = 5  then 55
    else 12
  end;

  select e.id into v_emp_id
  from public.empleados e
  where e.user_id = v_uid and e.activo = true
  for update;

  if v_emp_id is null then
    raise exception 'Tu cuenta no esta vinculada a un empleado activo';
  end if;

  with ctx as (
    select
      date_trunc('month', (now() at time zone 'Europe/Madrid')::date)::date as inicio,
      (date_trunc('month', (now() at time zone 'Europe/Madrid')::date) + interval '1 month')::date as fin
  ),
  base as (
    select coalesce(sum(d.total), 0)::int as pts
    from public.trabajadores_puntos_dias d, ctx
    where d.empleado_id = v_emp_id and d.fecha >= ctx.inicio and d.fecha < ctx.fin
  ),
  ajustes as (
    select coalesce(sum(a.delta_pts), 0)::int as pts
    from public.trabajadores_puntos_ajustes a, ctx
    where a.empleado_id = v_emp_id and a.fecha >= ctx.inicio and a.fecha < ctx.fin
  ),
  canjes as (
    select coalesce(sum(c.puntos_gastados), 0)::int as pts
    from public.trabajadores_ruleta_canjes c, ctx
    where c.empleado_id = v_emp_id and c.fecha >= ctx.inicio and c.fecha < ctx.fin
  )
  select greatest(base.pts + ajustes.pts - canjes.pts, 0)
  into v_disponibles
  from base, ajustes, canjes;

  if v_disponibles < v_coste then
    raise exception 'No tienes puntos suficientes para este canje';
  end if;

  insert into public.trabajadores_ruleta_canjes (empleado_id, fecha, puntos_gastados, tiradas_creadas, created_by)
  values (v_emp_id, (now() at time zone 'Europe/Madrid')::date, v_coste, p_tiradas, v_uid);

  for i in 1..p_tiradas loop
    insert into public.trabajadores_ruleta_tiradas (empleado_id, motivo, otorgado_por)
    values (
      v_emp_id,
      case
        when p_tiradas = 10 then 'Canje sabado: 100 puntos por 10 tiradas'
        when p_tiradas = 5  then 'Canje sabado: 55 puntos por 5 tiradas'
        else 'Canje sabado: 12 puntos por 1 tirada'
      end,
      v_uid
    );
  end loop;

  select count(*)::int into v_saldo
  from public.trabajadores_ruleta_tiradas t
  where t.empleado_id = v_emp_id and t.premio_id is null;

  return query select p_tiradas, v_coste, (v_disponibles - v_coste), v_saldo;
end;
$$;

grant execute on function public.ruleta_canjear_self(int) to authenticated;
