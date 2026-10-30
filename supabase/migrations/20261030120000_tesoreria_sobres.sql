-- Sobres clasifican movimientos existentes; no generan movimientos de caja.
create table public.tesoreria_sobres (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index tesoreria_sobres_nombre_unique
  on public.tesoreria_sobres (lower(btrim(nombre)));
alter table public.tesoreria_sobres enable row level security;
create policy "tesoreria_sobres: admin rw" on public.tesoreria_sobres
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));
grant select, insert, update, delete on public.tesoreria_sobres to authenticated;

-- RESTRICT impide borrar un sobre que aún tiene movimientos asignados.
alter table public.tesoreria_movimientos add column sobre_id uuid
  references public.tesoreria_sobres(id) on delete restrict;
create index tesoreria_movimientos_sobre_idx on public.tesoreria_movimientos(sobre_id);

create function public.tesoreria_sobres_resumen(p_desde date, p_hasta date)
returns table(id uuid, nombre text, salidas_total numeric, devoluciones_total numeric,
  acumulado numeric, neto_periodo numeric, movimientos bigint)
language sql security invoker stable set search_path = public
as $$
  with inicio as (
    select max(created_at) as corte from public.tesoreria_movimientos
    where concepto = 'Ajuste de apertura · Inicio 14/07/2026' and ajuste = true
  ), operativos as (
    select m.* from public.tesoreria_movimientos m cross join inicio i
    where i.corte is null or m.created_at > i.corte
  )
  select s.id, s.nombre,
    coalesce(sum(m.importe) filter (where m.tipo = 'salida'), 0),
    coalesce(sum(m.importe) filter (where m.tipo = 'entrada'), 0),
    coalesce(sum(case when m.tipo = 'salida' then m.importe else -m.importe end), 0),
    coalesce(sum(case when m.tipo = 'salida' then m.importe else -m.importe end)
      filter (where m.fecha between p_desde and p_hasta), 0),
    count(m.id)
  from public.tesoreria_sobres s left join operativos m on m.sobre_id = s.id
  group by s.id, s.nombre order by lower(s.nombre), s.id;
$$;
revoke all on function public.tesoreria_sobres_resumen(date,date) from public, anon;
grant execute on function public.tesoreria_sobres_resumen(date,date) to authenticated;
