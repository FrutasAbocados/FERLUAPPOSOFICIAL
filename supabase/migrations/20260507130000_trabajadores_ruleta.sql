-- ============================================================================
-- Trabajadores · Ruleta de la suerte + plus 5% self-view
-- ============================================================================
-- 1) RPC self-only `trabajadores_colaboraciones_self_mes` para que el empleado
--    vea su propio plus 5% en su Dashboard sin necesidad de RLS sobre la
--    vista admin `manager_ventas_efectivas` (security definer + filtro
--    auth.uid()).
-- 2) Ruleta por logros: admin otorga tiradas a un empleado (motivo libre,
--    "3 días sin retraso", etc.). El empleado tira en su Dashboard y se le
--    asigna un premio aleatorio ponderado por `peso` del catálogo.
--    Premios pueden ser puntos, euros, físicos o comodines (operativos).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. RPC self: plus 5% del mes para el empleado autenticado
-- ---------------------------------------------------------------------------
drop function if exists public.trabajadores_colaboraciones_self_mes(date);
create or replace function public.trabajadores_colaboraciones_self_mes(p_mes date default current_date)
returns table (
  empleado_id      uuid,
  nombre           text,
  num_clientes     int,
  facturacion_mes  numeric,
  comision         numeric
)
language sql security definer stable
set search_path = public
as $$
  with rng as (
    select date_trunc('month', p_mes)::date                         as inicio,
           (date_trunc('month', p_mes) + interval '1 month')::date  as fin
  ),
  vmes as (
    select v.contact_id, sum(v.subtotal) as venta
    from public.manager_ventas_efectivas v
    cross join rng
    where v.fecha >= rng.inicio and v.fecha < rng.fin
    group by v.contact_id
  ),
  agg as (
    select
      a.empleado_id,
      count(distinct a.contact_id)::int as num_clientes,
      coalesce(sum(vmes.venta), 0)      as facturacion_mes
    from public.trabajadores_clientes_asignados a
    cross join rng
    left join vmes on vmes.contact_id = a.contact_id
    where (a.asignado_desde is null or a.asignado_desde <= rng.fin)
    group by a.empleado_id
  )
  select
    e.id                                              as empleado_id,
    e.nombre,
    coalesce(agg.num_clientes, 0)                     as num_clientes,
    coalesce(agg.facturacion_mes, 0)                  as facturacion_mes,
    round(coalesce(agg.facturacion_mes, 0) * 0.05, 2) as comision
  from public.empleados e
  left join agg on agg.empleado_id = e.id
  where e.user_id = auth.uid() and e.activo = true
  limit 1;
$$;

grant execute on function public.trabajadores_colaboraciones_self_mes(date) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Catálogo de premios (admin edita desde la app)
-- ---------------------------------------------------------------------------
create table if not exists public.trabajadores_ruleta_premios (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  descripcion  text,
  tipo         text not null check (tipo in ('puntos','euros','fisico','comodin')),
  valor        numeric not null default 0,
  peso         int    not null default 1 check (peso between 1 and 100),
  icono        text,
  color        text,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists trab_ruleta_premios_activos_idx
  on public.trabajadores_ruleta_premios (activo) where activo = true;

alter table public.trabajadores_ruleta_premios enable row level security;

drop policy if exists "ruleta_premios: admin rw" on public.trabajadores_ruleta_premios;
create policy "ruleta_premios: admin rw"
  on public.trabajadores_ruleta_premios for all
  using (is_admin()) with check (is_admin());

drop policy if exists "ruleta_premios: empleado lee activos" on public.trabajadores_ruleta_premios;
create policy "ruleta_premios: empleado lee activos"
  on public.trabajadores_ruleta_premios for select
  using (activo = true);

drop policy if exists "ruleta_premios: responsable read" on public.trabajadores_ruleta_premios;
create policy "ruleta_premios: responsable read"
  on public.trabajadores_ruleta_premios for select
  using (es_responsable());


-- ---------------------------------------------------------------------------
-- 3. Tiradas (ciclo completo en una fila: otorgada → tirada → entregada)
-- ---------------------------------------------------------------------------
-- Estados (derivados):
--   PENDIENTE_TIRAR : premio_id is null
--   TIRADA          : premio_id not null and entregado = false
--   ENTREGADA       : entregado = true
-- Saldo del empleado = count(*) where premio_id is null (tiradas pendientes)
-- ---------------------------------------------------------------------------
create table if not exists public.trabajadores_ruleta_tiradas (
  id              uuid primary key default gen_random_uuid(),
  empleado_id     uuid not null references public.empleados(id) on delete cascade,
  motivo          text,
  otorgado_at     timestamptz not null default now(),
  otorgado_por    uuid references auth.users(id) on delete set null,
  premio_id       uuid references public.trabajadores_ruleta_premios(id) on delete restrict,
  tirada_at       timestamptz,
  entregado       boolean not null default false,
  entregado_at    timestamptz,
  entregado_por   uuid references auth.users(id) on delete set null
);

create index if not exists trab_ruleta_tiradas_emp_idx
  on public.trabajadores_ruleta_tiradas (empleado_id, otorgado_at desc);

create index if not exists trab_ruleta_tiradas_pendientes_idx
  on public.trabajadores_ruleta_tiradas (empleado_id, otorgado_at)
  where premio_id is null;

create index if not exists trab_ruleta_tiradas_no_entregadas_idx
  on public.trabajadores_ruleta_tiradas (empleado_id, tirada_at)
  where entregado = false and premio_id is not null;

alter table public.trabajadores_ruleta_tiradas enable row level security;

drop policy if exists "ruleta_tiradas: admin rw" on public.trabajadores_ruleta_tiradas;
create policy "ruleta_tiradas: admin rw"
  on public.trabajadores_ruleta_tiradas for all
  using (is_admin()) with check (is_admin());

drop policy if exists "ruleta_tiradas: empleado lee propio" on public.trabajadores_ruleta_tiradas;
create policy "ruleta_tiradas: empleado lee propio"
  on public.trabajadores_ruleta_tiradas for select
  using (exists (select 1 from public.empleados e where e.id = empleado_id and e.user_id = auth.uid()));

drop policy if exists "ruleta_tiradas: responsable read" on public.trabajadores_ruleta_tiradas;
create policy "ruleta_tiradas: responsable read"
  on public.trabajadores_ruleta_tiradas for select
  using (es_responsable());


-- ---------------------------------------------------------------------------
-- 4. Trigger updated_at en premios
-- ---------------------------------------------------------------------------
create or replace function public.trab_ruleta_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trab_ruleta_premios_touch on public.trabajadores_ruleta_premios;
create trigger trab_ruleta_premios_touch
  before update on public.trabajadores_ruleta_premios
  for each row execute function public.trab_ruleta_touch_updated();


-- ---------------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------------

-- Admin otorga N tiradas a un empleado con un motivo común
drop function if exists public.ruleta_otorgar_tirada(uuid, text, int);
create or replace function public.ruleta_otorgar_tirada(
  p_empleado uuid,
  p_motivo   text default null,
  p_cantidad int  default 1
)
returns int  -- saldo pendiente tras la operación
language plpgsql security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
        v_saldo int;
        i int;
begin
  if not is_admin() then
    raise exception 'Solo admin puede otorgar tiradas';
  end if;
  if p_cantidad < 1 or p_cantidad > 20 then
    raise exception 'Cantidad debe estar entre 1 y 20';
  end if;
  if not exists (select 1 from public.empleados where id = p_empleado and activo = true) then
    raise exception 'Empleado no existe o no está activo';
  end if;

  for i in 1..p_cantidad loop
    insert into public.trabajadores_ruleta_tiradas (empleado_id, motivo, otorgado_por)
      values (p_empleado, p_motivo, v_uid);
  end loop;

  select count(*) into v_saldo
  from public.trabajadores_ruleta_tiradas
  where empleado_id = p_empleado and premio_id is null;

  return v_saldo;
end;
$$;

grant execute on function public.ruleta_otorgar_tirada(uuid, text, int) to authenticated;


-- Empleado tira: consume la tirada pendiente más antigua, sortea premio ponderado
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
  -- 1. Resolver empleado por auth.uid()
  select e.id into v_emp_id
  from public.empleados e
  where e.user_id = v_uid and e.activo = true
  limit 1;

  if v_emp_id is null then
    raise exception 'Tu cuenta no está vinculada a un empleado activo';
  end if;

  -- 2. Lock + tomar la tirada pendiente más antigua del propio empleado
  -- Cualificar columnas: los OUT params (motivo, premio_id…) chocan con
  -- los nombres de columna en SELECTs sin alias dentro de plpgsql.
  select t.id, t.motivo into v_tirada_id, v_motivo
  from public.trabajadores_ruleta_tiradas t
  where t.empleado_id = v_emp_id and t.premio_id is null
  order by t.otorgado_at asc
  for update skip locked
  limit 1;

  if v_tirada_id is null then
    raise exception 'No tienes tiradas pendientes';
  end if;

  -- 3. Sortear premio ponderado por peso entre los activos
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

  -- 4. Asignar premio a la tirada
  update public.trabajadores_ruleta_tiradas t
     set premio_id = v_premio_id,
         tirada_at = now()
   where t.id = v_tirada_id;

  -- 5. Devolver datos del premio para mostrar en la UI
  return query
    select v_tirada_id,
           p.id, p.nombre, p.tipo, p.valor, p.icono, p.color,
           v_motivo
    from public.trabajadores_ruleta_premios p
    where p.id = v_premio_id;
end;
$$;

grant execute on function public.ruleta_tirar() to authenticated;


-- Admin marca tirada como entregada (premio físico/comodín ya canjeado)
drop function if exists public.ruleta_marcar_entregado(uuid, boolean);
create or replace function public.ruleta_marcar_entregado(
  p_tirada uuid,
  p_entregado boolean default true
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo admin puede marcar entregas';
  end if;
  update public.trabajadores_ruleta_tiradas
     set entregado    = p_entregado,
         entregado_at = case when p_entregado then now() else null end,
         entregado_por = case when p_entregado then auth.uid() else null end
   where id = p_tirada;
end;
$$;

grant execute on function public.ruleta_marcar_entregado(uuid, boolean) to authenticated;


-- Resumen para admin: por empleado, saldo pendiente + nº tiradas + nº pendientes-entregar
drop function if exists public.ruleta_resumen_admin();
create or replace function public.ruleta_resumen_admin()
returns table (
  empleado_id        uuid,
  nombre             text,
  saldo_pendiente    int,
  tiradas_total      int,
  pendientes_entrega int,
  ultima_tirada_at   timestamptz
)
language sql security invoker stable as $$
  -- `count(*) filter (where t.id is not null …)` evita el falso 1 que produce
  -- el LEFT JOIN cuando un empleado no tiene tiradas (Postgres mete fila NULL
  -- y `t.premio_id IS NULL` matcheaba erróneamente).
  select
    e.id,
    e.nombre,
    count(*) filter (where t.id is not null and t.premio_id is null)::int                         as saldo_pendiente,
    count(*) filter (where t.id is not null and t.premio_id is not null)::int                     as tiradas_total,
    count(*) filter (where t.id is not null and t.premio_id is not null and not t.entregado)::int as pendientes_entrega,
    max(t.tirada_at) as ultima_tirada_at
  from public.empleados e
  left join public.trabajadores_ruleta_tiradas t on t.empleado_id = e.id
  where e.activo = true
  group by e.id, e.nombre
  order by e.nombre;
$$;

grant execute on function public.ruleta_resumen_admin() to authenticated;


-- Saldo pendiente del empleado autenticado (para card en su Dashboard)
drop function if exists public.ruleta_saldo_self();
create or replace function public.ruleta_saldo_self()
returns int
language sql security definer stable
set search_path = public
as $$
  select coalesce(count(*), 0)::int
  from public.trabajadores_ruleta_tiradas t
  join public.empleados e on e.id = t.empleado_id
  where e.user_id = auth.uid() and e.activo = true and t.premio_id is null;
$$;

grant execute on function public.ruleta_saldo_self() to authenticated;


-- ---------------------------------------------------------------------------
-- 6. Seed inicial — 10 premios variados (admin puede editar/borrar)
-- ---------------------------------------------------------------------------
insert into public.trabajadores_ruleta_premios (nombre, descripcion, tipo, valor, peso, icono, color) values
  ('+10 puntos',          'Suma 10 puntos al mes',                      'puntos',  10, 8, '⭐',  'amber'),
  ('+25 puntos',          'Suma 25 puntos al mes (¡buen pellizco!)',    'puntos',  25, 4, '🌟',  'amber'),
  ('+50 puntos',          '¡Premio gordo! 50 puntos al mes',            'puntos',  50, 1, '🏆',  'amber'),
  ('5€ extra',            '5€ al sueldo del mes',                       'euros',    5, 5, '💸',  'emerald'),
  ('10€ extra',           '10€ al sueldo del mes',                      'euros',   10, 3, '💰',  'emerald'),
  ('Caja de fruta',       'Caja de fruta de la semana',                 'fisico',   0, 6, '🥝',  'lime'),
  ('Café invita Luis',    'Café del finde a cuenta de la casa',         'fisico',   0, 8, '☕',  'amber'),
  ('Comida invita Luis',  'Comida con el equipo invitado',              'fisico',   0, 1, '🍽️', 'rose'),
  ('Sales 30 min antes',  'Comodín: te vas 30 min antes un día',        'comodin',  0, 5, '🏃',  'sky'),
  ('Eliges reparto',      'Comodín: eliges tu ruta de reparto un día',  'comodin',  0, 4, '🚛',  'indigo')
on conflict do nothing;
