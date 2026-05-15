-- Caja cierre dia: permitir marcar un reparto como deuda.
-- La deuda suma al total de reparto para eficiencia, pero no a efectivo/tarjeta.

alter table public.repartos_jornada_lineas
  drop constraint if exists repartos_jornada_lineas_forma_pago_check;

alter table public.repartos_jornada_lineas
  add constraint repartos_jornada_lineas_forma_pago_check
  check (forma_pago in ('efectivo', 'tarjeta', 'deuda'));

drop function if exists public.cash_stats_semanas(date, date);

create or replace function public.cash_stats_semanas(
  p_from date,
  p_to   date
)
returns table (
  semana_inicio    date,
  empleado_id      uuid,
  empleado_nombre  text,
  horas            numeric,
  total            numeric,
  efectivo         numeric,
  tarjeta          numeric,
  deuda            numeric,
  jornadas         int
)
language sql
stable
as $$
  with horas_jor as (
    select
      date_trunc('week', j.fecha)::date as semana_inicio,
      j.empleado_id,
      sum(
        case
          when j.hora_inicio is not null and j.hora_fin is not null
            then extract(epoch from (j.hora_fin - j.hora_inicio)) / 3600.0
          else 0
        end
      ) as horas,
      count(*) as jornadas
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
  )
  select
    h.semana_inicio,
    h.empleado_id,
    e.nombre as empleado_nombre,
    h.horas,
    coalesce(li.total, 0)    as total,
    coalesce(li.efectivo, 0) as efectivo,
    coalesce(li.tarjeta, 0)  as tarjeta,
    coalesce(li.deuda, 0)    as deuda,
    h.jornadas::int
  from horas_jor h
  left join lineas_jor li
    on li.semana_inicio = h.semana_inicio
   and li.empleado_id   = h.empleado_id
  left join public.empleados e on e.id = h.empleado_id
  order by h.semana_inicio asc, e.nombre asc
$$;

grant execute on function public.cash_stats_semanas(date, date) to authenticated;
