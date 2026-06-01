-- 1) Estadísticas de fichaje por empleado en un rango [p_desde, p_hasta].
--    Horas, días, media/día, hora media de entrada/salida, puntualidad vs
--    horario contractual y olvidos. INVOKER: la RLS filtra (admin/responsable
--    ven todo; empleado solo lo suyo). La vista que la consume es admin.
create or replace function public.trabajadores_fichajes_stats(
  p_desde date,
  p_hasta date
)
returns table(
  empleado_id uuid,
  empleado_nombre text,
  empleado_color text,
  total_horas numeric,
  dias_trabajados integer,
  media_horas_dia numeric,
  num_fichajes integer,
  abiertos integer,
  hora_media_entrada text,
  hora_media_salida text,
  horario_entrada text,
  retraso_medio_min integer,
  jornada_horas_semana numeric
)
language sql
stable
set search_path to 'public'
as $function$
  with fl as (
    select
      f.empleado_id,
      (f.ts_in  at time zone 'Europe/Madrid')           as ts_in_local,
      (f.ts_out at time zone 'Europe/Madrid')           as ts_out_local,
      (f.ts_in  at time zone 'Europe/Madrid')::date     as fecha,
      f.ts_out is null                                   as abierto,
      extract(epoch from (coalesce(f.ts_out, now()) - f.ts_in)) / 3600.0 as horas
    from public.trabajadores_fichajes f
    where f.ts_in >= p_desde
      and f.ts_in < (p_hasta + 1)
  ),
  agg as (
    select
      fl.empleado_id,
      sum(fl.horas)                                          as total_horas,
      count(distinct fl.fecha)                               as dias,
      count(*)                                               as num,
      count(*) filter (where fl.abierto)                     as abiertos,
      avg(extract(epoch from fl.ts_in_local::time))          as ent_secs,
      avg(extract(epoch from fl.ts_out_local::time))
        filter (where not fl.abierto)                        as sal_secs
    from fl
    group by fl.empleado_id
  )
  select
    e.id,
    e.nombre,
    e.color,
    round(coalesce(a.total_horas, 0)::numeric, 1),
    coalesce(a.dias, 0)::int,
    case when coalesce(a.dias, 0) > 0
         then round((a.total_horas / a.dias)::numeric, 1) else 0 end,
    coalesce(a.num, 0)::int,
    coalesce(a.abiertos, 0)::int,
    case when a.ent_secs is not null
         then to_char(make_interval(secs => a.ent_secs), 'HH24:MI') end,
    case when a.sal_secs is not null
         then to_char(make_interval(secs => a.sal_secs), 'HH24:MI') end,
    to_char(c.horario_entrada, 'HH24:MI'),
    case when c.horario_entrada is not null and a.ent_secs is not null
         then round((a.ent_secs - extract(epoch from c.horario_entrada)) / 60.0)::int end,
    c.jornada_horas_semana::numeric
  from public.empleados e
  left join agg a on a.empleado_id = e.id
  left join public.trabajadores_condiciones c on c.empleado_id = e.id
  where e.activo = true
  order by e.nombre;
$function$;

revoke execute on function public.trabajadores_fichajes_stats(date, date) from anon;
grant execute on function public.trabajadores_fichajes_stats(date, date) to authenticated;

-- 2) Detalle mensual ahora incluye ubicación de entrada/salida.
drop function if exists public.trabajadores_fichajes_mes(uuid, date);
create function public.trabajadores_fichajes_mes(
  p_empleado_id uuid,
  p_mes date default current_date
)
returns table(
  id uuid,
  ts_in timestamptz,
  ts_out timestamptz,
  fecha date,
  horas numeric,
  fuente text,
  nota text,
  lat_in double precision,
  lng_in double precision,
  lat_out double precision,
  lng_out double precision
)
language sql
stable
set search_path to 'public'
as $function$
  select
    f.id,
    f.ts_in,
    f.ts_out,
    (f.ts_in at time zone 'Europe/Madrid')::date as fecha,
    case when f.ts_out is null then null
         else round((extract(epoch from (f.ts_out - f.ts_in)) / 3600.0)::numeric, 2)
    end as horas,
    f.fuente,
    f.nota,
    f.lat_in, f.lng_in, f.lat_out, f.lng_out
  from public.trabajadores_fichajes f
  where f.empleado_id = p_empleado_id
    and f.ts_in >= date_trunc('month', p_mes)
    and f.ts_in < date_trunc('month', p_mes) + interval '1 month'
  order by f.ts_in desc;
$function$;

revoke execute on function public.trabajadores_fichajes_mes(uuid, date) from anon;
grant execute on function public.trabajadores_fichajes_mes(uuid, date) to authenticated;
