-- Documentación de la empresa (Ferlu Project S.L., B22560510).
-- Archivo privado de escrituras, declaraciones censales, modelos fiscales,
-- estados contables, licencias y certificados.
-- Acceso SOLO para los usuarios de documentacion_acceso (decisión de Luis,
-- 2026-11-26: únicamente él). No basta con ser admin: ni admin_op, ni
-- empleados, ni el gestor externo (que sí lee gestoria-documentos).
-- La tabla nace vacía; el alta del usuario se hace como dato, no en el repo.

create table if not exists public.documentacion_acceso (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.documentacion_acceso enable row level security;
revoke all on public.documentacion_acceso from anon, authenticated;

create or replace function public.puede_ver_documentacion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.documentacion_acceso a where a.user_id = auth.uid());
$$;
revoke all on function public.puede_ver_documentacion() from public, anon;
grant execute on function public.puede_ver_documentacion() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentacion-empresa',
  'documentacion-empresa',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documentacion-empresa: titular rw" on storage.objects;
create policy "documentacion-empresa: titular rw"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'documentacion-empresa' and (select public.puede_ver_documentacion()))
  with check (bucket_id = 'documentacion-empresa' and (select public.puede_ver_documentacion()));

create table if not exists public.documentos_empresa (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in (
    'societario', 'censal', 'iva', 'sociedades', 'otros_impuestos',
    'contabilidad', 'licencias', 'bancos_seguros', 'notificaciones', 'otros'
  )),
  tipo text not null,                       -- p. ej. 'Escritura de constitución', 'Modelo 303'
  modelo text,                              -- '036', '303', '390', '200', '115'…
  titulo text not null,
  ejercicio smallint check (ejercicio between 2000 and 2100),
  periodo text check (periodo is null or periodo ~ '^(0A|[1-4]T|(0[1-9]|1[0-2]))$'),
  fecha_documento date,
  estado text not null default 'original' check (estado in (
    'presentado', 'borrador', 'copia_autorizada', 'copia_simple',
    'inscrita', 'original', 'informativo'
  )),
  entidad_nif text not null default 'B22560510',
  csv_aeat text,
  justificante text,
  storage_path text not null unique,
  nombre_original text not null,
  mime_type text,
  bytes bigint check (bytes is null or bytes >= 0),
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  origen text not null default 'subida' check (origen in ('gmail', 'subida')),
  origen_ref jsonb,                         -- {hilo, mensaje, adjunto, remitente, fecha, asunto, otros_mensajes}
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create index if not exists documentos_empresa_cat_ej_idx
  on public.documentos_empresa (categoria, ejercicio desc, periodo);

create or replace function public.documentos_empresa_touch_updated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists documentos_empresa_touch on public.documentos_empresa;
create trigger documentos_empresa_touch
  before update on public.documentos_empresa
  for each row execute function public.documentos_empresa_touch_updated();

alter table public.documentos_empresa enable row level security;

drop policy if exists "documentos_empresa: titular rw" on public.documentos_empresa;
create policy "documentos_empresa: titular rw"
  on public.documentos_empresa
  for all
  to authenticated
  using ((select public.puede_ver_documentacion()))
  with check ((select public.puede_ver_documentacion()));

revoke all on public.documentos_empresa from anon;
grant select, insert, update, delete on public.documentos_empresa to authenticated;
