-- Objetivos de productividad por trabajador (+importe/mes binario si se cumple)
-- Feature A: define un objetivo por empleado y marca cumplido mes a mes.

-- 1) Definición del objetivo (uno o varios por empleado; el activo se muestra)
create table if not exists public.empleado_objetivos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  titulo text not null,
  descripcion text,
  importe numeric not null default 200,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists empleado_objetivos_empleado_idx on public.empleado_objetivos(empleado_id) where activo;

-- 2) Cumplimiento mensual (snapshot del importe al marcar para no alterar histórico)
create table if not exists public.empleado_objetivo_mes (
  id uuid primary key default gen_random_uuid(),
  objetivo_id uuid not null references public.empleado_objetivos(id) on delete cascade,
  mes date not null,                       -- primer día del mes
  cumplido boolean not null default false,
  importe_aplicado numeric not null default 0,
  nota text,
  marcado_por uuid references auth.users(id),
  marcado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (objetivo_id, mes)
);
create index if not exists empleado_objetivo_mes_mes_idx on public.empleado_objetivo_mes(mes);

-- 3) Trigger updated_at compartido del módulo objetivos
create or replace function public.objetivos_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists empleado_objetivos_touch on public.empleado_objetivos;
create trigger empleado_objetivos_touch before update on public.empleado_objetivos
  for each row execute function public.objetivos_touch_updated();

drop trigger if exists empleado_objetivo_mes_touch on public.empleado_objetivo_mes;
create trigger empleado_objetivo_mes_touch before update on public.empleado_objetivo_mes
  for each row execute function public.objetivos_touch_updated();

-- 4) RLS triple-rol
alter table public.empleado_objetivos enable row level security;
alter table public.empleado_objetivo_mes enable row level security;

drop policy if exists "empleado_objetivos: admin rw" on public.empleado_objetivos;
create policy "empleado_objetivos: admin rw" on public.empleado_objetivos
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "empleado_objetivos: empleado lee propio" on public.empleado_objetivos;
create policy "empleado_objetivos: empleado lee propio" on public.empleado_objetivos
  for select using (
    exists (select 1 from public.empleados e where e.id = empleado_objetivos.empleado_id and e.user_id = auth.uid())
  );

drop policy if exists "empleado_objetivos: responsable read" on public.empleado_objetivos;
create policy "empleado_objetivos: responsable read" on public.empleado_objetivos
  for select using (public.es_responsable());

drop policy if exists "empleado_objetivo_mes: admin rw" on public.empleado_objetivo_mes;
create policy "empleado_objetivo_mes: admin rw" on public.empleado_objetivo_mes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "empleado_objetivo_mes: empleado lee propio" on public.empleado_objetivo_mes;
create policy "empleado_objetivo_mes: empleado lee propio" on public.empleado_objetivo_mes
  for select using (
    exists (
      select 1 from public.empleado_objetivos o
      join public.empleados e on e.id = o.empleado_id
      where o.id = empleado_objetivo_mes.objetivo_id and e.user_id = auth.uid()
    )
  );

drop policy if exists "empleado_objetivo_mes: responsable read" on public.empleado_objetivo_mes;
create policy "empleado_objetivo_mes: responsable read" on public.empleado_objetivo_mes
  for select using (public.es_responsable());

-- 5) Seed: objetivos dictados por Luis (importe = plus_otros actual; editables en admin).
--    Solo inserta si el empleado no tiene ya un objetivo activo.
insert into public.empleado_objetivos (empleado_id, titulo, descripcion, importe)
select e.id, v.titulo, v.descripcion, coalesce(nullif(e.plus_otros, 0), 200)
from public.empleados e
join (values
  ('Raul Pedros',  'Control de deuda y facturas del abuelo al día', 'Llevar al día el control de la deuda y las facturas del abuelo.'),
  ('Adrian Torres','BBDD de clientes actualizada al día',            'Mantener la base de datos de clientes actualizada con las preferencias de cada cliente.'),
  ('Alex Ruiz',    'Control de faltas Mercamálaga y cajas devueltas', 'Control de faltas en Mercamálaga y de cajas devueltas al proveedor.'),
  ('Alvaro Gomez', 'Seguimiento de incidencias, faltas y abonos',    'Llevar el seguimiento de todas las incidencias, faltas y abonos que hay que hacer.')
) as v(nombre, titulo, descripcion) on v.nombre = e.nombre
where e.activo
  and not exists (select 1 from public.empleado_objetivos o where o.empleado_id = e.id and o.activo);
