-- Merma diaria por trabajador
-- Registro de la merma que se lleva un trabajador: solo referencia y peso (kg).
-- Se activa por trabajador con empleados.merma_activa (ficha en BBDD Trabajadores).
-- Alta manual o dictada por voz (la transcripción se hace en el navegador; no se guarda audio).

alter table public.empleados
  add column if not exists merma_activa boolean not null default false;

comment on column public.empleados.merma_activa is
  'Si true, el trabajador ve la pestaña Merma y debe registrar a diario la merma que se lleva.';

update public.empleados set merma_activa = true where nombre = 'Alex Ruiz';

create table if not exists public.trabajadores_merma (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete restrict,
  fecha date not null default (now() at time zone 'Europe/Madrid')::date,
  referencia text not null check (length(btrim(referencia)) between 1 and 120),
  peso_kg numeric(10, 3) not null check (peso_kg > 0 and peso_kg <= 1000),
  origen text not null default 'manual' check (origen in ('manual', 'voz')),
  created_by uuid not null default auth.uid(),
  created_at timestamp with time zone not null default now()
);

comment on table public.trabajadores_merma is
  'Merma diaria que se lleva cada trabajador con merma_activa: referencia + peso en kg.';

create index if not exists trabajadores_merma_fecha_idx
  on public.trabajadores_merma (fecha desc, empleado_id);

-- ¿El usuario actual tiene la merma activada? Devuelve false, nunca NULL.
create or replace function public.merma_activa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select e.merma_activa
    from public.empleados e
    where e.user_id = auth.uid() and e.activo
    limit 1
  ), false);
$$;

revoke all on function public.merma_activa() from public, anon;
grant execute on function public.merma_activa() to authenticated;

-- Empleado propio con merma activa (para las políticas de escritura).
create or replace function public.merma_empleado_propio_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.empleados e
  where e.user_id = auth.uid() and e.activo and e.merma_activa
  limit 1;
$$;

revoke all on function public.merma_empleado_propio_id() from public, anon;
grant execute on function public.merma_empleado_propio_id() to authenticated;

-- Referencias sugeridas: nombres de producto del catálogo Holded (solo nombres).
create or replace function public.merma_referencias()
returns table (referencia text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.holded_product_name
  from public.pedidos_wa_productos_holded p
  where p.holded_product_name is not null
    and (public.is_admin() or public.merma_activa())
  order by 1;
$$;

revoke all on function public.merma_referencias() from public, anon;
grant execute on function public.merma_referencias() to authenticated;

alter table public.trabajadores_merma enable row level security;

drop policy if exists "merma: leer" on public.trabajadores_merma;
create policy "merma: leer"
  on public.trabajadores_merma
  for select
  to authenticated
  using (
    (select public.is_admin())
    or created_by = (select auth.uid())
  );

drop policy if exists "merma: alta propia" on public.trabajadores_merma;
create policy "merma: alta propia"
  on public.trabajadores_merma
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and empleado_id = (select public.merma_empleado_propio_id())
  );

-- El trabajador corrige borrando y volviendo a añadir, solo en el mismo día.
drop policy if exists "merma: borrar" on public.trabajadores_merma;
create policy "merma: borrar"
  on public.trabajadores_merma
  for delete
  to authenticated
  using (
    (select public.is_admin())
    or (
      created_by = (select auth.uid())
      and fecha = (now() at time zone 'Europe/Madrid')::date
    )
  );

grant select, insert, delete on public.trabajadores_merma to authenticated;
revoke all on public.trabajadores_merma from anon;
