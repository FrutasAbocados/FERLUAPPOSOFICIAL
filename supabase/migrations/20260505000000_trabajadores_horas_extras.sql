-- ============================================================================
-- Trabajadores · Horas extras (decisiones 2026-05-04)
-- ============================================================================
-- Cada evento = horas que hizo un trabajador fuera de su jornada, junto al
-- modo de compensación elegido. Convención (Luis):
--   - 1 hora compensada = 1 hora (1:1, sin multiplicador)
--   - 1 día compensado  = 7 horas (jornada estándar Ferlu)
-- Estado: pendiente → liquidado (cuando se ha pagado / disfrutado).
-- ============================================================================

create table if not exists public.trabajadores_horas_extras (
  id                uuid primary key default gen_random_uuid(),
  empleado_id       uuid not null references public.empleados(id) on delete cascade,
  fecha             date not null,                                     -- día en que se hicieron
  horas             numeric(5,2) not null check (horas > 0 and horas <= 24),
  modo              text not null check (modo in ('pago','horas','dias_vac')),
  -- pago     → 10€/h × horas
  -- horas    → horas libres compensadas (1:1)
  -- dias_vac → días extra de vacaciones (horas/7)
  estado            text not null default 'pendiente' check (estado in ('pendiente','liquidado')),
  motivo            text,
  fecha_liquidado   date,
  creado_por        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists trab_he_emp_fecha_idx
  on public.trabajadores_horas_extras (empleado_id, fecha desc);
create index if not exists trab_he_estado_idx
  on public.trabajadores_horas_extras (estado, fecha desc);

create or replace function public.trab_he_touch_updated() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trab_he_touch on public.trabajadores_horas_extras;
create trigger trab_he_touch
  before update on public.trabajadores_horas_extras
  for each row execute function public.trab_he_touch_updated();

alter table public.trabajadores_horas_extras enable row level security;

drop policy if exists "trab_he: admin rw" on public.trabajadores_horas_extras;
create policy "trab_he: admin rw"
  on public.trabajadores_horas_extras for all
  using  (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full','admin_op')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full','admin_op')));

drop policy if exists "trab_he: empleado lee propio" on public.trabajadores_horas_extras;
create policy "trab_he: empleado lee propio"
  on public.trabajadores_horas_extras for select
  using (exists (select 1 from public.empleados e where e.id = empleado_id and e.user_id = auth.uid()));

drop policy if exists "trab_he: responsable read" on public.trabajadores_horas_extras;
create policy "trab_he: responsable read"
  on public.trabajadores_horas_extras for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'responsable'));


-- RPC resumen mensual: por trabajador, totales por modo y estado
drop function if exists public.trabajadores_horas_extras_resumen_mes(date);
create or replace function public.trabajadores_horas_extras_resumen_mes(p_mes date default current_date)
returns table (
  empleado_id              uuid,
  nombre                   text,
  horas_pago_pendientes    numeric,
  horas_pago_liquidadas    numeric,
  importe_pago_pendiente   numeric,
  importe_pago_liquidado   numeric,
  horas_compensadas_pend   numeric,
  horas_compensadas_liq    numeric,
  dias_vac_pendientes      numeric,
  dias_vac_liquidados      numeric
)
language sql security invoker stable as $$
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
$$;


-- RPC listado por mes (con datos del empleado para listar todo el mes)
drop function if exists public.trabajadores_horas_extras_lista_mes(date, uuid);
create or replace function public.trabajadores_horas_extras_lista_mes(
  p_mes        date default current_date,
  p_empleado   uuid default null
)
returns table (
  id              uuid,
  empleado_id     uuid,
  empleado_nombre text,
  fecha           date,
  horas           numeric,
  modo            text,
  estado          text,
  motivo          text,
  fecha_liquidado date,
  importe_eur     numeric,
  dias_vac_eq     numeric,
  created_at      timestamptz
)
language sql security invoker stable as $$
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
    h.motivo,
    h.fecha_liquidado,
    case when h.modo = 'pago'     then round(h.horas * 10, 2)   else 0::numeric end as importe_eur,
    case when h.modo = 'dias_vac' then round(h.horas / 7.0, 2)  else 0::numeric end as dias_vac_eq,
    h.created_at
  from public.trabajadores_horas_extras h
  cross join rng
  left join public.empleados e on e.id = h.empleado_id
  where h.fecha >= rng.inicio and h.fecha < rng.fin
    and (p_empleado is null or h.empleado_id = p_empleado)
  order by h.fecha desc, h.created_at desc;
$$;

grant execute on function public.trabajadores_horas_extras_resumen_mes(date)        to authenticated;
grant execute on function public.trabajadores_horas_extras_lista_mes(date, uuid)    to authenticated;
