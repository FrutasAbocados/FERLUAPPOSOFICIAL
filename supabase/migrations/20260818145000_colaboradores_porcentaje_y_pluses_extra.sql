-- Colaboradores: porcentaje configurable por cliente + pluses extraordinarios.
-- Abuelo se asigna a Raúl al 3%. El resto conserva el 5% por defecto.

alter table public.trabajadores_clientes_asignados
  add column if not exists comision_pct numeric(5, 2) not null default 5
    check (comision_pct > 0 and comision_pct <= 100);

comment on column public.trabajadores_clientes_asignados.comision_pct is
  'Porcentaje interno aplicado a la facturación del cliente asignado. No se muestra en la vista personal.';

insert into public.trabajadores_clientes_asignados (
  empleado_id,
  contact_id,
  asignado_desde,
  notas,
  comision_pct
)
select
  e.id,
  'abuelo',
  date '2026-08-18',
  'Colaboración Abuelo',
  3
from public.empleados e
join public.profiles p on p.id = e.user_id
where lower(p.email) = 'raulpedper@gmail.com'
on conflict (empleado_id, contact_id) do update
set comision_pct = excluded.comision_pct,
    notas = excluded.notas;

-- Resumen administrativo con porcentaje individual por asignación.
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
  where e.activo = true
  order by e.nombre;
$$;

drop function if exists public.trabajadores_colaboraciones_detalle_mes(uuid, date);
create function public.trabajadores_colaboraciones_detalle_mes(
  p_empleado uuid,
  p_mes date default current_date
)
returns table (
  contact_id text,
  nombre text,
  facturacion numeric,
  comision numeric,
  asignado_desde date,
  comision_pct numeric
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
  )
  select
    a.contact_id,
    coalesce(c.nombre, a.contact_id),
    coalesce(vmes.venta, 0),
    round(coalesce(vmes.venta, 0) * a.comision_pct / 100, 2),
    a.asignado_desde,
    a.comision_pct
  from public.trabajadores_clientes_asignados a
  left join public.manager_contactos c on c.id = a.contact_id
  left join vmes on vmes.contact_id = a.contact_id
  cross join rng
  where a.empleado_id = p_empleado
    and (a.asignado_desde is null or a.asignado_desde < rng.fin)
  order by coalesce(vmes.venta, 0) desc, c.nombre asc;
$$;

create or replace function public.trabajadores_colaboraciones_self_mes(
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
security definer
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
  where e.user_id = auth.uid() and e.activo = true
  limit 1;
$$;

revoke all on function public.trabajadores_colaboraciones_resumen_mes(date) from public, anon;
revoke all on function public.trabajadores_colaboraciones_detalle_mes(uuid, date) from public, anon;
revoke all on function public.trabajadores_colaboraciones_self_mes(date) from public, anon;
grant execute on function public.trabajadores_colaboraciones_resumen_mes(date) to authenticated;
grant execute on function public.trabajadores_colaboraciones_detalle_mes(uuid, date) to authenticated;
grant execute on function public.trabajadores_colaboraciones_self_mes(date) to authenticated;

create table if not exists public.trabajadores_pluses_extra (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  fecha date not null default current_date,
  importe numeric(10, 2) not null check (importe > 0),
  concepto text not null check (length(trim(concepto)) > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.trabajadores_pluses_extra is
  'Reconocimientos económicos puntuales, separados de comisiones, objetivos y pluses fijos de nómina.';

create index if not exists trabajadores_pluses_extra_empleado_fecha_idx
  on public.trabajadores_pluses_extra (empleado_id, fecha desc);

drop trigger if exists trabajadores_pluses_extra_touch on public.trabajadores_pluses_extra;
create trigger trabajadores_pluses_extra_touch
  before update on public.trabajadores_pluses_extra
  for each row execute function public.touch_updated_at();

alter table public.trabajadores_pluses_extra enable row level security;

drop policy if exists "pluses_extra: admin rw" on public.trabajadores_pluses_extra;
create policy "pluses_extra: admin rw"
  on public.trabajadores_pluses_extra for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pluses_extra: responsable read" on public.trabajadores_pluses_extra;
create policy "pluses_extra: responsable read"
  on public.trabajadores_pluses_extra for select
  to authenticated
  using (public.es_responsable());

drop policy if exists "pluses_extra: empleado lee propio" on public.trabajadores_pluses_extra;
create policy "pluses_extra: empleado lee propio"
  on public.trabajadores_pluses_extra for select
  to authenticated
  using (
    exists (
      select 1
      from public.empleados e
      where e.id = trabajadores_pluses_extra.empleado_id
        and e.user_id = auth.uid()
        and e.activo = true
    )
  );

revoke all on public.trabajadores_pluses_extra from anon;
grant select, insert, update, delete on public.trabajadores_pluses_extra to authenticated;

insert into public.trabajadores_pluses_extra (empleado_id, fecha, importe, concepto)
select e.id, date '2026-08-18', 50, 'Reconocimiento por su buen trabajo'
from public.empleados e
join public.profiles p on p.id = e.user_id
where lower(p.email) = 'raulpedper@gmail.com'
  and not exists (
    select 1
    from public.trabajadores_pluses_extra pe
    where pe.empleado_id = e.id
      and pe.fecha = date '2026-08-18'
      and pe.importe = 50
      and pe.concepto = 'Reconocimiento por su buen trabajo'
  );
