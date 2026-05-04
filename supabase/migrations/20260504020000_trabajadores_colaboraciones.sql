-- ============================================================================
-- Trabajadores · Colaboraciones (5% sobre facturación clientes asignados)
-- ============================================================================
-- Cada trabajador tiene clientes "suyos" (los que trajo al negocio).
-- Mensualmente cobra el 5% de la facturación de esos clientes, según
-- manager_ventas_efectivas (subtotal sin IVA).
-- ============================================================================

create table if not exists public.trabajadores_clientes_asignados (
  id              uuid primary key default gen_random_uuid(),
  empleado_id     uuid not null references public.empleados(id) on delete cascade,
  contact_id      text not null references public.manager_contactos(id) on delete cascade,
  asignado_desde  date,
  notas           text,
  creado_por      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (empleado_id, contact_id)
);

create index if not exists trab_cli_asign_emp_idx
  on public.trabajadores_clientes_asignados (empleado_id);

alter table public.trabajadores_clientes_asignados enable row level security;

drop policy if exists "trab_cli_asign: admin rw" on public.trabajadores_clientes_asignados;
create policy "trab_cli_asign: admin rw"
  on public.trabajadores_clientes_asignados for all
  using  (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full','admin_op')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full','admin_op')));

drop policy if exists "trab_cli_asign: responsable read" on public.trabajadores_clientes_asignados;
create policy "trab_cli_asign: responsable read"
  on public.trabajadores_clientes_asignados for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'responsable'));

drop policy if exists "trab_cli_asign: empleado lee propio" on public.trabajadores_clientes_asignados;
create policy "trab_cli_asign: empleado lee propio"
  on public.trabajadores_clientes_asignados for select
  using (exists (select 1 from public.empleados e where e.id = empleado_id and e.user_id = auth.uid()));


-- RPC resumen mensual: por trabajador, num clientes + facturación + 5%
drop function if exists public.trabajadores_colaboraciones_resumen_mes(date);
create or replace function public.trabajadores_colaboraciones_resumen_mes(p_mes date default current_date)
returns table (
  empleado_id      uuid,
  nombre           text,
  num_clientes     int,
  facturacion_mes  numeric,
  comision         numeric
)
language sql security invoker stable as $$
  with rng as (
    select date_trunc('month', p_mes)::date                            as inicio,
           (date_trunc('month', p_mes) + interval '1 month')::date     as fin
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
      count(distinct a.contact_id)::int                  as num_clientes,
      coalesce(sum(vmes.venta), 0)                       as facturacion_mes
    from public.trabajadores_clientes_asignados a
    cross join rng
    left join vmes on vmes.contact_id = a.contact_id
    where (a.asignado_desde is null or a.asignado_desde <= rng.fin)
    group by a.empleado_id
  )
  select
    e.id                                                 as empleado_id,
    e.nombre,
    coalesce(agg.num_clientes, 0)                        as num_clientes,
    coalesce(agg.facturacion_mes, 0)                     as facturacion_mes,
    round(coalesce(agg.facturacion_mes, 0) * 0.05, 2)    as comision
  from public.empleados e
  left join agg on agg.empleado_id = e.id
  where e.activo = true
  order by e.nombre;
$$;


-- RPC detalle por empleado: clientes y su facturación + 5% individual
drop function if exists public.trabajadores_colaboraciones_detalle_mes(uuid, date);
create or replace function public.trabajadores_colaboraciones_detalle_mes(
  p_empleado uuid,
  p_mes      date default current_date
)
returns table (
  contact_id   text,
  nombre       text,
  facturacion  numeric,
  comision     numeric,
  asignado_desde date
)
language sql security invoker stable as $$
  with rng as (
    select date_trunc('month', p_mes)::date                            as inicio,
           (date_trunc('month', p_mes) + interval '1 month')::date     as fin
  ),
  vmes as (
    select v.contact_id, sum(v.subtotal) as venta
    from public.manager_ventas_efectivas v
    cross join rng
    where v.fecha >= rng.inicio and v.fecha < rng.fin
    group by v.contact_id
  )
  select
    a.contact_id,
    coalesce(c.nombre, a.contact_id)                     as nombre,
    coalesce(vmes.venta, 0)                              as facturacion,
    round(coalesce(vmes.venta, 0) * 0.05, 2)             as comision,
    a.asignado_desde
  from public.trabajadores_clientes_asignados a
  left join public.manager_contactos c on c.id = a.contact_id
  left join vmes on vmes.contact_id = a.contact_id
  where a.empleado_id = p_empleado
  order by coalesce(vmes.venta, 0) desc, c.nombre asc;
$$;

grant execute on function public.trabajadores_colaboraciones_resumen_mes(date)        to authenticated;
grant execute on function public.trabajadores_colaboraciones_detalle_mes(uuid, date)  to authenticated;
