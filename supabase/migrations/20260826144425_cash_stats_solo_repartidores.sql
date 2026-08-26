-- Caja > Estadisticas debe medir solo a quienes participan en reparto.
-- Los cierres y fichajes historicos se conservan; esta marca solo controla
-- su inclusion en cash_stats_semanas (tambien consumida por el Agente IA).
alter table public.empleados
  add column if not exists incluir_productividad_reparto boolean not null default true;

comment on column public.empleados.incluir_productividad_reparto is
  'Incluye al trabajador en las estadisticas de productividad por hora de reparto.';

update public.empleados
set incluir_productividad_reparto = false
where lower(btrim(nombre)) in ('alex ruiz', 'luis preview');

create or replace function public.cash_stats_semanas(p_from date, p_to date)
returns table(
  semana_inicio date,
  empleado_id uuid,
  empleado_nombre text,
  horas numeric,
  total numeric,
  efectivo numeric,
  gastos numeric,
  efectivo_neto numeric,
  monedas numeric,
  efectivo_neto_sin_monedas numeric,
  tarjeta numeric,
  deuda numeric,
  jornadas integer
)
language sql
security invoker
stable
set search_path to 'public'
as $function$
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
