-- Export detallado de fichajes (todos los empleados activos visibles por RLS)
-- en un rango, para el Registro de Jornada (Hacienda / Inspección / gestoría).
-- INVOKER: la RLS filtra (admin/responsable ven todo).
create or replace function public.trabajadores_fichajes_export(
  p_desde date,
  p_hasta date
)
returns table(
  empleado_id uuid,
  empleado_nombre text,
  ts_in timestamptz,
  ts_out timestamptz,
  fecha date,
  horas numeric,
  fuente text
)
language sql
stable
set search_path to 'public'
as $function$
  select
    f.empleado_id,
    e.nombre,
    f.ts_in,
    f.ts_out,
    (f.ts_in at time zone 'Europe/Madrid')::date as fecha,
    case when f.ts_out is null then null
         else round((extract(epoch from (f.ts_out - f.ts_in)) / 3600.0)::numeric, 2)
    end as horas,
    f.fuente
  from public.trabajadores_fichajes f
  join public.empleados e on e.id = f.empleado_id
  where f.ts_in >= p_desde
    and f.ts_in < (p_hasta + 1)
  order by e.nombre, f.ts_in;
$function$;

revoke execute on function public.trabajadores_fichajes_export(date, date) from anon;
grant execute on function public.trabajadores_fichajes_export(date, date) to authenticated;
