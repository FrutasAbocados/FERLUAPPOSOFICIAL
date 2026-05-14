-- Programa de fidelizacion por cliente.
-- Tabla operativa pequena: guarda overrides manuales, estado y proxima accion.

create table if not exists public.clientes_programa (
  contact_name_canon     text primary key,
  programa_manual        text check (
    programa_manual is null or programa_manual in ('vip', 'riesgo', 'deuda', 'potencial', 'rentable', 'estandar')
  ),
  estado                 text not null default 'activo' check (estado in ('activo', 'seguimiento', 'pausado', 'cerrado')),
  prioridad              text not null default 'media' check (prioridad in ('baja', 'media', 'alta')),
  proxima_accion         text,
  proxima_accion_fecha   date,
  ultimo_contacto_at     timestamptz,
  ultimo_contacto_tipo   text check (
    ultimo_contacto_tipo is null or ultimo_contacto_tipo in ('llamada', 'whatsapp', 'visita', 'nota')
  ),
  responsable            uuid references auth.users(id) on delete set null,
  notas                  text,
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists clientes_programa_estado_idx
  on public.clientes_programa (estado, proxima_accion_fecha nulls last);

create index if not exists clientes_programa_programa_idx
  on public.clientes_programa (programa_manual)
  where programa_manual is not null;

create or replace function public.clientes_programa_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists clientes_programa_touch on public.clientes_programa;
create trigger clientes_programa_touch
  before update on public.clientes_programa
  for each row execute function public.clientes_programa_touch_updated();

alter table public.clientes_programa enable row level security;

drop policy if exists "clientes_programa: admin rw" on public.clientes_programa;
create policy "clientes_programa: admin rw"
  on public.clientes_programa for all
  using (is_admin())
  with check (is_admin());
