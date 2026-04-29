-- ============================================================================
-- Trabajadores — Sábados trabajados (pack 2)
-- ============================================================================
-- Pack 2 cobra una tarifa fija por cada sábado trabajado (default 70€).
-- Registro independiente de Turnos (manual) pero con función para importar
-- desde Turnos los sábados con turno != 'libre'.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tarifa por sábado en empleados (configurable per trabajador)
-- ---------------------------------------------------------------------------
alter table public.empleados
  add column if not exists tarifa_sabado numeric(10, 2) default 70;

comment on column public.empleados.tarifa_sabado is
  'Importe €/sábado trabajado. Solo aplica si pack=2. Default 70.';


-- ---------------------------------------------------------------------------
-- 2) Tabla de sábados trabajados
-- ---------------------------------------------------------------------------
create table if not exists public.trabajadores_sabados_trabajados (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  fecha        date not null,
  nota         text,
  creado_por   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (empleado_id, fecha)
);

create index if not exists trab_sab_empleado_fecha_idx
  on public.trabajadores_sabados_trabajados (empleado_id, fecha desc);


-- ---------------------------------------------------------------------------
-- 3) RLS — admin rw + empleado lee propio
-- ---------------------------------------------------------------------------
alter table public.trabajadores_sabados_trabajados enable row level security;

drop policy if exists "sabados: admin rw" on public.trabajadores_sabados_trabajados;
create policy "sabados: admin rw"
  on public.trabajadores_sabados_trabajados for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  );

drop policy if exists "sabados: empleado lee propio" on public.trabajadores_sabados_trabajados;
create policy "sabados: empleado lee propio"
  on public.trabajadores_sabados_trabajados for select
  using (
    exists (select 1 from public.empleados e where e.id = empleado_id and e.user_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 4) RPC: resumen mensual de sábados (empleados pack 2)
--    p_mes: cualquier fecha dentro del mes objetivo
-- ---------------------------------------------------------------------------
create or replace function public.trabajadores_sabados_resumen_mes(p_mes date default current_date)
returns table (
  empleado_id   uuid,
  nombre        text,
  tarifa        numeric,
  num_sabados   bigint,
  importe       numeric
)
language sql security invoker stable as $$
  with rng as (
    select
      date_trunc('month', p_mes)::date as inicio,
      (date_trunc('month', p_mes) + interval '1 month')::date as fin
  )
  select
    e.id as empleado_id,
    e.nombre,
    coalesce(e.tarifa_sabado, 70) as tarifa,
    count(s.id) as num_sabados,
    (count(s.id) * coalesce(e.tarifa_sabado, 70))::numeric(10,2) as importe
  from public.empleados e
  left join public.trabajadores_sabados_trabajados s
    on s.empleado_id = e.id
   and s.fecha >= (select inicio from rng)
   and s.fecha <  (select fin    from rng)
  where e.activo = true and e.pack = 2
  group by e.id, e.nombre, e.tarifa_sabado
  order by e.nombre;
$$;


-- ---------------------------------------------------------------------------
-- 5) RPC: importar sábados desde Turnos para un mes
--    Marca como trabajados todos los sábados (dow=6) en los que el empleado
--    pack 2 tenga un turno distinto de 'libre'.
--    Devuelve número de filas insertadas (idempotente, ignora duplicados).
-- ---------------------------------------------------------------------------
create or replace function public.trabajadores_sabados_importar_turnos(p_mes date default current_date)
returns int
language plpgsql security invoker as $$
declare
  v_count int := 0;
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fin    date := (date_trunc('month', p_mes) + interval '1 month')::date;
begin
  with insertados as (
    insert into public.trabajadores_sabados_trabajados (empleado_id, fecha, nota, creado_por)
    select t.empleado_id, t.fecha, 'importado de turnos', auth.uid()
    from public.turnos t
    join public.empleados e on e.id = t.empleado_id
    where e.pack = 2
      and e.activo = true
      and t.fecha >= v_inicio and t.fecha < v_fin
      and extract(dow from t.fecha) = 6
      and t.tipo <> 'libre'
    on conflict (empleado_id, fecha) do nothing
    returning 1
  )
  select count(*) into v_count from insertados;
  return v_count;
end;
$$;
