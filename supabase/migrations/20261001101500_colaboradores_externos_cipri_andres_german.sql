-- Colaboradores externos: Cipri (Victor Beach 4%) y Andrés (Casa Paco 5%).
-- Germán (inactivo como empleado) suma Alma 2 y La Ranita al 5%.
-- Los externos son fichas inactivas en empleados (no entran en nóminas, turnos,
-- fichajes ni equipo); el resumen de colaboraciones muestra a cualquier ficha
-- con clientes asignados, esté activa o no.

insert into public.empleados (nombre, activo, puesto, notas)
select v.nombre, false, 'Colaborador externo', 'Solo comisión por clientes asignados'
from (values ('Cipri'), ('Andres')) as v(nombre)
where not exists (select 1 from public.empleados e where e.nombre = v.nombre);

insert into public.trabajadores_clientes_asignados (empleado_id, contact_id, comision_pct, notas)
select e.id, x.contact_id, x.pct, x.notas
from (values
  ('Cipri',         '6887e9431a61c4357503462f', 4::numeric, 'Victor Beach'),
  ('Andres',        '6914e98eb2125c4e6009fc7c', 5::numeric, 'Casa Paco'),
  ('German Kramer', '6a4eb2b2c72843bfec0502b6', 5::numeric, 'Alma 2'),
  ('German Kramer', '68cfce1655a246421200dfee', 5::numeric, 'La Ranita')
) as x(nombre, contact_id, pct, notas)
join public.empleados e on e.nombre = x.nombre
on conflict (empleado_id, contact_id) do update
set comision_pct = excluded.comision_pct;

create or replace function public.trabajadores_colaboraciones_resumen_mes(
  p_mes date default current_date
)
returns table (
  empleado_id uuid,
  nombre text,
  num_clientes int,
  facturacion_mes numeric,
  comision numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with rng as (
    select date_trunc('month', p_mes)::date as inicio,
           (date_trunc('month', p_mes) + interval '1 month')::date as fin
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
      coalesce(sum(vmes.venta), 0) as facturacion_mes,
      coalesce(sum(coalesce(vmes.venta, 0) * a.comision_pct / 100), 0) as comision
    from public.trabajadores_clientes_asignados a
    cross join rng
    left join vmes on vmes.contact_id = a.contact_id
    where a.asignado_desde is null or a.asignado_desde < rng.fin
    group by a.empleado_id
  )
  select
    e.id,
    e.nombre,
    coalesce(agg.num_clientes, 0),
    coalesce(agg.facturacion_mes, 0),
    round(coalesce(agg.comision, 0), 2)
  from public.empleados e
  left join agg on agg.empleado_id = e.id
  where e.activo = true or agg.empleado_id is not null
  order by e.nombre;
$$;
