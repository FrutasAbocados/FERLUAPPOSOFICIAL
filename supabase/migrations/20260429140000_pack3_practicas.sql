-- ============================================================================
-- Trabajadores — Pack 3: Prácticas (4h, sueldo fijo + crédito frutas)
-- ============================================================================
-- Pack 1 = completo (pluses, crédito, puntos, vacaciones 60d)
-- Pack 2 = sin pluses, sueldo neto, sábados 70€, vacaciones 48d
-- Pack 3 = prácticas: sueldo fijo (ej. 500€) + crédito frutas. Sin pluses,
--          sin sábados, sin puntos. Vacaciones 0 (no aplica).
-- ============================================================================

-- 1) Ampliar check de pack
alter table public.empleados drop constraint if exists empleados_pack_check;
alter table public.empleados add constraint empleados_pack_check check (pack in (1, 2, 3));

comment on column public.empleados.pack is
  '1 = completo · 2 = básico (sábados 70€) · 3 = prácticas (4h, sueldo fijo + frutas).';


-- 2) Crédito frutas: aplica también a pack 3
create or replace function public.trabajadores_credito_estado_actual()
returns table (
  empleado_id       uuid,
  nombre            text,
  limite_base       numeric,
  exceso_arrastrado numeric,
  gastado           numeric,
  disponible        numeric,
  exceso_nuevo      numeric
)
language plpgsql security invoker stable as $$
#variable_conflict use_column
declare
  r record;
  e record;
begin
  for e in
    select emp.id as id, emp.nombre as nombre
    from public.empleados emp
    where emp.activo = true and emp.pack in (1, 3)
    order by emp.nombre
  loop
    select * into r from public.trabajadores_credito_estado_mes(e.id, current_date);
    return query select
      e.id,
      e.nombre,
      r.limite_base,
      r.exceso_arrastrado,
      r.gastado,
      r.disponible,
      r.exceso_nuevo;
  end loop;
end;
$$;


-- 3) Vacaciones: pack 3 = 0 días anuales (no aplica)
create or replace function public.trabajadores_vacaciones_resumen_anual(p_anio int default null)
returns table (
  empleado_id   uuid,
  nombre        text,
  pack          smallint,
  dias_anuales  int,
  disfrutados   bigint,
  aprobados     bigint,
  pendientes    bigint,
  restantes     int
)
language sql security invoker stable as $$
  with anio as (
    select coalesce(p_anio, extract(year from current_date)::int) as y
  ),
  agg as (
    select
      v.empleado_id,
      sum(case when v.estado = 'disfrutado' then v.dias else 0 end)::bigint as disfrutados,
      sum(case when v.estado = 'aprobado'   then v.dias else 0 end)::bigint as aprobados,
      sum(case when v.estado = 'pendiente'  then v.dias else 0 end)::bigint as pendientes
    from public.trabajadores_vacaciones v, anio a
    where extract(year from v.fecha_inicio) = a.y
    group by v.empleado_id
  ),
  cfg as (
    select e.id, e.nombre, e.pack,
      case e.pack when 1 then 60 when 2 then 48 else 0 end as dias_anuales
    from public.empleados e
    where e.activo = true
  )
  select
    c.id,
    c.nombre,
    c.pack,
    c.dias_anuales,
    coalesce(g.disfrutados, 0) as disfrutados,
    coalesce(g.aprobados,   0) as aprobados,
    coalesce(g.pendientes,  0) as pendientes,
    (c.dias_anuales
       - coalesce(g.disfrutados, 0)::int
       - coalesce(g.aprobados,   0)::int) as restantes
  from cfg c
  left join agg g on g.empleado_id = c.id
  order by c.nombre;
$$;
