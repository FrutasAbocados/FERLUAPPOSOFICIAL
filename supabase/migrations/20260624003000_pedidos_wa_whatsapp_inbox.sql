-- ============================================================================
-- Pedidos WhatsApp — inbox automatico desde WhatsApp Business API
-- ============================================================================
-- Staging seguro:
-- - Guarda mensajes entrantes de WhatsApp.
-- - Mapea telefono -> cliente de pedidos_wa_clientes.
-- - Genera filas copiables en formato operativo.
-- No inserta pedidos_wa ni dispara Holded.
-- ============================================================================

create or replace function public.pedidos_wa_fecha_negocio(p_ts timestamptz default now())
returns date
language sql
stable
as $$
  select case
    when extract(hour from (p_ts at time zone 'Europe/Madrid')) < 10
      then ((p_ts at time zone 'Europe/Madrid')::date - 1)
    else (p_ts at time zone 'Europe/Madrid')::date
  end
$$;

create table if not exists public.pedidos_wa_cliente_telefonos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.pedidos_wa_clientes(id) on delete cascade,
  telefono_norm     text not null unique check (telefono_norm ~ '^[0-9]{8,16}$'),
  telefono_display  text,
  etiqueta          text,
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists pedidos_wa_cliente_telefonos_cliente_idx
  on public.pedidos_wa_cliente_telefonos (cliente_id)
  where activo;

drop trigger if exists trg_pedidos_wa_cliente_telefonos_updated_at on public.pedidos_wa_cliente_telefonos;
create trigger trg_pedidos_wa_cliente_telefonos_updated_at
  before update on public.pedidos_wa_cliente_telefonos
  for each row execute function public.touch_updated_at();

create table if not exists public.pedidos_wa_whatsapp_filas (
  id                  uuid primary key default gen_random_uuid(),
  fecha               date not null,
  cliente_id          uuid not null references public.pedidos_wa_clientes(id) on delete cascade,
  pedido              text not null default '',
  faltas              text,
  estado              text not null default 'pendiente'
                        check (estado in ('pendiente','listo','revisar','error')),
  confianza           numeric(4,3) check (confianza is null or (confianza >= 0 and confianza <= 1)),
  source_message_ids  text[] not null default '{}',
  raw_respuesta       jsonb,
  modelo              text,
  error               text,
  generated_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (fecha, cliente_id)
);

create index if not exists pedidos_wa_whatsapp_filas_fecha_idx
  on public.pedidos_wa_whatsapp_filas (fecha desc, estado);

create index if not exists pedidos_wa_whatsapp_filas_cliente_idx
  on public.pedidos_wa_whatsapp_filas (cliente_id, fecha desc);

drop trigger if exists trg_pedidos_wa_whatsapp_filas_updated_at on public.pedidos_wa_whatsapp_filas;
create trigger trg_pedidos_wa_whatsapp_filas_updated_at
  before update on public.pedidos_wa_whatsapp_filas
  for each row execute function public.touch_updated_at();

create table if not exists public.pedidos_wa_whatsapp_mensajes (
  id                uuid primary key default gen_random_uuid(),
  wa_message_id     text not null unique,
  phone_number_id   text,
  telefono_norm     text not null check (telefono_norm ~ '^[0-9]{8,16}$'),
  perfil_nombre     text,
  cliente_id        uuid references public.pedidos_wa_clientes(id) on delete set null,
  fila_id           uuid references public.pedidos_wa_whatsapp_filas(id) on delete set null,
  fecha_negocio     date not null default public.pedidos_wa_fecha_negocio(now()),
  received_at       timestamptz not null default now(),
  message_type      text not null,
  texto             text,
  raw_payload       jsonb not null default '{}'::jsonb,
  estado            text not null default 'recibido'
                      check (estado in ('recibido','sin_cliente','sin_texto','procesado','error')),
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists pedidos_wa_whatsapp_mensajes_fecha_idx
  on public.pedidos_wa_whatsapp_mensajes (fecha_negocio desc, received_at desc);

create index if not exists pedidos_wa_whatsapp_mensajes_cliente_fecha_idx
  on public.pedidos_wa_whatsapp_mensajes (cliente_id, fecha_negocio, received_at)
  where cliente_id is not null;

create index if not exists pedidos_wa_whatsapp_mensajes_telefono_idx
  on public.pedidos_wa_whatsapp_mensajes (telefono_norm, fecha_negocio desc);

create index if not exists pedidos_wa_whatsapp_mensajes_estado_idx
  on public.pedidos_wa_whatsapp_mensajes (estado, fecha_negocio desc);

drop trigger if exists trg_pedidos_wa_whatsapp_mensajes_updated_at on public.pedidos_wa_whatsapp_mensajes;
create trigger trg_pedidos_wa_whatsapp_mensajes_updated_at
  before update on public.pedidos_wa_whatsapp_mensajes
  for each row execute function public.touch_updated_at();

alter table public.pedidos_wa_cliente_telefonos enable row level security;
alter table public.pedidos_wa_whatsapp_mensajes enable row level security;
alter table public.pedidos_wa_whatsapp_filas enable row level security;

drop policy if exists "pedidos_wa_cliente_telefonos: admin rw" on public.pedidos_wa_cliente_telefonos;
create policy "pedidos_wa_cliente_telefonos: admin rw"
  on public.pedidos_wa_cliente_telefonos for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pedidos_wa_cliente_telefonos: responsable read" on public.pedidos_wa_cliente_telefonos;
create policy "pedidos_wa_cliente_telefonos: responsable read"
  on public.pedidos_wa_cliente_telefonos for select
  using (public.es_responsable());

drop policy if exists "pedidos_wa_whatsapp_mensajes: admin rw" on public.pedidos_wa_whatsapp_mensajes;
create policy "pedidos_wa_whatsapp_mensajes: admin rw"
  on public.pedidos_wa_whatsapp_mensajes for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pedidos_wa_whatsapp_mensajes: responsable read" on public.pedidos_wa_whatsapp_mensajes;
create policy "pedidos_wa_whatsapp_mensajes: responsable read"
  on public.pedidos_wa_whatsapp_mensajes for select
  using (public.es_responsable());

drop policy if exists "pedidos_wa_whatsapp_filas: admin rw" on public.pedidos_wa_whatsapp_filas;
create policy "pedidos_wa_whatsapp_filas: admin rw"
  on public.pedidos_wa_whatsapp_filas for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pedidos_wa_whatsapp_filas: responsable read" on public.pedidos_wa_whatsapp_filas;
create policy "pedidos_wa_whatsapp_filas: responsable read"
  on public.pedidos_wa_whatsapp_filas for select
  using (public.es_responsable());
