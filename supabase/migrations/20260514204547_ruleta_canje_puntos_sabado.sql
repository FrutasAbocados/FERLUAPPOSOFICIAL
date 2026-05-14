-- ============================================================================
-- Trabajadores · Ruleta por canje de puntos solo sabados
-- ============================================================================
-- Los empleados pueden convertir puntos del mes en tiradas los sabados:
--   15 puntos  -> 1 tirada
--   100 puntos -> 10 tiradas
-- El canje queda trazado y el resumen mensual descuenta los puntos gastados.
-- ============================================================================

create table if not exists public.trabajadores_ruleta_canjes (
  id              uuid primary key default gen_random_uuid(),
  empleado_id     uuid not null references public.empleados(id) on delete cascade,
  fecha           date not null default current_date,
  puntos_gastados int not null check (puntos_gastados in (15, 100)),
  tiradas_creadas int not null check (tiradas_creadas in (1, 10)),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists trab_ruleta_canjes_emp_fecha_idx
  on public.trabajadores_ruleta_canjes (empleado_id, fecha desc);

alter table public.trabajadores_ruleta_canjes enable row level security;

drop policy if exists "ruleta_canjes: admin read" on public.trabajadores_ruleta_canjes;
create policy "ruleta_canjes: admin read"
  on public.trabajadores_ruleta_canjes for select
  using (is_admin() or es_responsable());

drop policy if exists "ruleta_canjes: empleado lee propio" on public.trabajadores_ruleta_canjes;
create policy "ruleta_canjes: empleado lee propio"
  on public.trabajadores_ruleta_canjes for select
  using (exists (select 1 from public.empleados e where e.id = empleado_id and e.user_id = auth.uid()));

-- El insert lo hace la RPC security definer para que el canje sea atomico.
grant select on public.trabajadores_ruleta_canjes to authenticated;


create or replace function public.ruleta_es_sabado_madrid(p_now timestamptz default now())
returns boolean
language sql stable
as $$
  select extract(isodow from (p_now at time zone 'Europe/Madrid'))::int = 6;
$$;

grant execute on function public.ruleta_es_sabado_madrid(timestamptz) to authenticated;


drop function if exists public.trabajadores_puntos_resumen_mes(date);
create or replace function public.trabajadores_puntos_resumen_mes(p_mes date default current_date)
returns table (
  empleado_id           uuid,
  nombre                text,
  dias_puntuados        bigint,
  pts_base              bigint,
  pts_ajustes           bigint,
  pts_canjeados         bigint,
  total_puntos          bigint,
  pts_puntualidad       bigint,
  pts_reparto           bigint,
  pts_responsabilidad   bigint,
  euros                 numeric
)
language sql security invoker stable as $$
  with rng as (
    select
      date_trunc('month', p_mes)::date                            as inicio,
      (date_trunc('month', p_mes) + interval '1 month')::date     as fin
  ),
  base as (
    select
      e.id  as empleado_id,
      e.nombre,
      count(d.id)                                                 as dias_puntuados,
      coalesce(sum(d.total),           0)::bigint                 as pts_base,
      coalesce(sum(d.puntualidad),     0)::bigint                 as pts_puntualidad,
      coalesce(sum(d.reparto),         0)::bigint                 as pts_reparto,
      coalesce(sum(d.responsabilidad), 0)::bigint                 as pts_responsabilidad
    from public.empleados e
    left join public.trabajadores_puntos_dias d
      on d.empleado_id = e.id
     and d.fecha >= (select inicio from rng)
     and d.fecha <  (select fin    from rng)
    where e.activo = true and e.pack = 1
    group by e.id, e.nombre
  ),
  ajustes as (
    select
      a.empleado_id,
      coalesce(sum(a.delta_pts), 0)::bigint as pts_ajustes
    from public.trabajadores_puntos_ajustes a, rng
    where a.fecha >= rng.inicio and a.fecha < rng.fin
    group by a.empleado_id
  ),
  canjes as (
    select
      c.empleado_id,
      coalesce(sum(c.puntos_gastados), 0)::bigint as pts_canjeados
    from public.trabajadores_ruleta_canjes c, rng
    where c.fecha >= rng.inicio and c.fecha < rng.fin
    group by c.empleado_id
  )
  select
    b.empleado_id,
    b.nombre,
    b.dias_puntuados,
    b.pts_base,
    coalesce(aj.pts_ajustes, 0)                                  as pts_ajustes,
    coalesce(cj.pts_canjeados, 0)                                 as pts_canjeados,
    greatest(
      b.pts_base + coalesce(aj.pts_ajustes, 0) - coalesce(cj.pts_canjeados, 0),
      0
    )                                                            as total_puntos,
    b.pts_puntualidad,
    b.pts_reparto,
    b.pts_responsabilidad,
    public.trab_pts_a_euros(greatest(
      b.pts_base + coalesce(aj.pts_ajustes, 0) - coalesce(cj.pts_canjeados, 0),
      0
    )::int)                                                       as euros
  from base b
  left join ajustes aj on aj.empleado_id = b.empleado_id
  left join canjes cj on cj.empleado_id = b.empleado_id
  order by b.nombre;
$$;

grant execute on function public.trabajadores_puntos_resumen_mes(date) to authenticated;


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
    (ctx.activa and ctx.es_sabado and coalesce(d.puntos, 0) >= 15)  as puede_canjear_1,
    (ctx.activa and ctx.es_sabado and coalesce(d.puntos, 0) >= 100) as puede_canjear_10
  from emp
  cross join ctx
  left join saldo s on s.empleado_id = emp.id
  left join disponible d on d.empleado_id = emp.id;
$$;

grant execute on function public.ruleta_self_estado() to authenticated;


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

  if p_tiradas not in (1, 10) then
    raise exception 'Canje no valido';
  end if;

  v_coste := case when p_tiradas = 10 then 100 else 15 end;

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
      case when p_tiradas = 10 then 'Canje sabado: 100 puntos por 10 tiradas' else 'Canje sabado: 15 puntos por 1 tirada' end,
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


drop function if exists public.ruleta_saldo_self();
create or replace function public.ruleta_saldo_self()
returns int
language sql security definer stable
set search_path = public
as $$
  select case
    when not public.ruleta_is_activa() then 0
    when not public.ruleta_es_sabado_madrid(now()) then 0
    else coalesce(count(*), 0)::int
  end
  from public.trabajadores_ruleta_tiradas t
  join public.empleados e on e.id = t.empleado_id
  where e.user_id = auth.uid() and e.activo = true and t.premio_id is null;
$$;

grant execute on function public.ruleta_saldo_self() to authenticated;


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
    raise exception 'La ruleta esta desactivada';
  end if;

  if not public.ruleta_es_sabado_madrid(now()) then
    raise exception 'La ruleta solo se puede usar los sabados';
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
