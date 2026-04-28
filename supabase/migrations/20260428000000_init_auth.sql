-- ============================================================================
-- Abocados OS — Migración inicial: roles + perfiles
-- ============================================================================
-- Crea la tabla `profiles` con un campo `role` que enlaza con usuarios de
-- Supabase Auth. Define las RLS para que cada usuario lea su propio perfil
-- y los admins lean todos. Los roles son la base de la autorización por
-- módulo en la app.
-- ============================================================================

-- 1. Tipo enum de roles
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin_full', 'admin_op', 'empleado');
  end if;
end$$;

-- 2. Tabla de perfiles (1 fila por usuario auth)
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  display_name  text not null,
  role          public.app_role not null default 'empleado',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Trigger para updated_at automático
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 3. Helper: rol del usuario actual
create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin_full()
returns boolean
language sql stable
as $$
  select public.current_role() = 'admin_full'::public.app_role;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable
as $$
  select public.current_role() in ('admin_full'::public.app_role, 'admin_op'::public.app_role);
$$;

-- 4. RLS en profiles
alter table public.profiles enable row level security;

drop policy if exists "profiles: leer propio o si admin" on public.profiles;
create policy "profiles: leer propio o si admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: actualizar propio (sin tocar role)" on public.profiles;
create policy "profiles: actualizar propio (sin tocar role)"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists "profiles: admin_full puede todo" on public.profiles;
create policy "profiles: admin_full puede todo"
  on public.profiles for all
  using (public.is_admin_full())
  with check (public.is_admin_full());

-- 5. Cuando se crea un user en auth, crear perfil base con rol 'empleado'
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'empleado'
  )
  on conflict (id) do nothing;
  return new;
end$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
