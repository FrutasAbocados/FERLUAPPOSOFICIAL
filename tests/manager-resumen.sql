-- Solo lectura. Ejecutar después de aplicar la migración del dashboard.
-- Cada fila debe devolver true en las cuatro comparaciones.
begin read only;
select set_config('request.jwt.claim.sub',
  (select id::text from public.profiles where role = 'admin_full' order by id limit 1), true);

with periodos(desde, hasta) as (
  values (current_date, current_date),
         (date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date),
         ((date_trunc('month', current_date) - interval '1 month')::date, date_trunc('month', current_date)::date - 1),
         ((date_trunc('month', current_date) - interval '3 months')::date, date_trunc('month', current_date)::date - 1),
         (date '2099-01-01', date '2099-01-02')
), datos as materialized (
  select desde, hasta, public.manager_resumen_dashboard(desde, hasta) as nuevo,
    (select to_jsonb(r) from public.manager_resumen_comparativo(desde, hasta) r) as resumen,
    coalesce((select jsonb_agg(to_jsonb(r) order by r.fecha) from public.manager_serie_diaria(desde, hasta) r), '[]'::jsonb) as serie,
    coalesce((select jsonb_agg(to_jsonb(r) order by r.contact_name_canon) from public.manager_top_clientes_margen(desde, hasta, 10) r), '[]'::jsonb) as clientes,
    coalesce((select jsonb_agg(to_jsonb(r) order by r.nombre) from public.manager_top_productos_margen(desde, hasta, 10) r), '[]'::jsonb) as productos
  from periodos
)
select desde, hasta, nuevo->'resumen' = resumen as resumen_igual,
       nuevo->'serie' = serie as serie_igual,
       coalesce((select jsonb_agg(e order by e->>'contact_name_canon') from jsonb_array_elements(nuevo->'top_clientes') e), '[]'::jsonb) = clientes as clientes_igual,
       coalesce((select jsonb_agg(e order by e->>'nombre') from jsonb_array_elements(nuevo->'top_productos') e), '[]'::jsonb) = productos as productos_igual
from datos;

-- Comparar tiempo SQL con caché caliente: repetir ambos EXPLAIN alternándolos.
explain (analyze, buffers)
select public.manager_resumen_dashboard(date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date);

explain (analyze, buffers)
select
  (select jsonb_agg(to_jsonb(r)) from public.manager_resumen_comparativo(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date) r),
  (select jsonb_agg(to_jsonb(r)) from public.manager_serie_diaria(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date) r),
  (select jsonb_agg(to_jsonb(r)) from public.manager_top_clientes_margen(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 10) r),
  (select jsonb_agg(to_jsonb(r)) from public.manager_top_productos_margen(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 10) r);

-- Un empleado no recibe datos (ni siquiera importes agregados).
select set_config('request.jwt.claim.sub',
  (select id::text from public.profiles where role = 'empleado' order by id limit 1), true);
select public.manager_resumen_dashboard(current_date, current_date) is null as empleado_sin_datos;

rollback;
