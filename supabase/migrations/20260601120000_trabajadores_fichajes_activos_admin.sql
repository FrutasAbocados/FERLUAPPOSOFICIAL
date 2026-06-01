-- Panel de control en vivo para Álvaro/admin: quién está fichado AHORA mismo,
-- desde cuándo, ubicación y si arrastra un fichaje de un día anterior (olvido de salida).
-- SECURITY DEFINER porque debe ver TODOS los empleados; guard explícito de rol dentro.
create or replace function public.trabajadores_fichajes_activos_admin()
returns table(
  id uuid,
  empleado_id uuid,
  empleado_nombre text,
  empleado_color text,
  ts_in timestamptz,
  segundos_dentro integer,
  lat_in double precision,
  lng_in double precision,
  dia_anterior boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    f.id,
    f.empleado_id,
    e.nombre,
    e.color,
    f.ts_in,
    extract(epoch from (now() - f.ts_in))::int as segundos_dentro,
    f.lat_in,
    f.lng_in,
    ( (f.ts_in at time zone 'Europe/Madrid')::date
      < (now() at time zone 'Europe/Madrid')::date ) as dia_anterior
  from public.trabajadores_fichajes f
  join public.empleados e on e.id = f.empleado_id
  where f.ts_out is null
    and (public.is_admin() or public.es_responsable())
  order by f.ts_in asc;
$function$;

revoke execute on function public.trabajadores_fichajes_activos_admin() from anon;
grant execute on function public.trabajadores_fichajes_activos_admin() to authenticated;
