-- Módulo Incidencias: cualquier trabajador crea/ve; admins + gestor (Gómez) resuelven.

-- 1) Flag de gestor de incidencias en empleados
alter table public.empleados
  add column if not exists puede_gestionar_incidencias boolean not null default false;

update public.empleados set puede_gestionar_incidencias = true where nombre = 'Alvaro Gomez';

-- 2) Helper: admin o empleado con flag de gestión
create or replace function public.puede_gestionar_incidencias()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.empleados e
    where e.user_id = auth.uid() and e.puede_gestionar_incidencias
  );
$$;

-- 3) Tabla incidencias
create table if not exists public.incidencias (
  id uuid primary key default gen_random_uuid(),
  contact_name_canon text not null,
  fecha date not null default current_date,
  tipo text not null default 'incidencia' check (tipo in ('incidencia','falta','abono','otro')),
  descripcion text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_proceso','resuelta')),
  autor_empleado_id uuid references public.empleados(id) on delete set null,
  resuelto_por uuid references auth.users(id),
  resuelto_at timestamptz,
  resolucion_nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists incidencias_estado_idx on public.incidencias(estado, fecha desc);
create index if not exists incidencias_cliente_idx on public.incidencias(contact_name_canon);

drop trigger if exists incidencias_touch on public.incidencias;
create trigger incidencias_touch before update on public.incidencias
  for each row execute function public.objetivos_touch_updated();

-- 4) RLS: empleados/responsable/admin leen todas; empleado crea (autor = sí mismo); gestor+admin resuelven
alter table public.incidencias enable row level security;

drop policy if exists "incidencias: equipo lee" on public.incidencias;
create policy "incidencias: equipo lee" on public.incidencias
  for select using (
    public.is_admin() or public.es_responsable()
    or exists (select 1 from public.empleados e where e.user_id = auth.uid())
  );

drop policy if exists "incidencias: empleado crea" on public.incidencias;
create policy "incidencias: empleado crea" on public.incidencias
  for insert with check (
    exists (select 1 from public.empleados e where e.user_id = auth.uid() and e.id = incidencias.autor_empleado_id)
    or public.is_admin()
  );

drop policy if exists "incidencias: gestor actualiza" on public.incidencias;
create policy "incidencias: gestor actualiza" on public.incidencias
  for update using (public.puede_gestionar_incidencias()) with check (public.puede_gestionar_incidencias());

drop policy if exists "incidencias: admin borra" on public.incidencias;
create policy "incidencias: admin borra" on public.incidencias
  for delete using (public.is_admin());

-- 5) RPC ligero para el selector de cliente (solo nombres, sin financieros)
create or replace function public.incidencias_clientes_lista()
returns table(nombre_canon text, poblacion text)
language sql stable security definer set search_path = public as $$
  select nombre_canon, poblacion
  from public.manager_contacto_canon
  where nombre_canon is not null and nombre_canon <> ''
  order by nombre_canon;
$$;

revoke all on function public.incidencias_clientes_lista() from public;
grant execute on function public.incidencias_clientes_lista() to authenticated;
