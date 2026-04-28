-- ============================================================================
-- Abocados OS — Módulo Manager: cache de Holded
-- ============================================================================
-- Tablas que cachean ventas y compras importadas desde la API de Holded.
-- El sync lo hace una Edge Function (`holded-sync`) que upsertea por `id`
-- (id de Holded), idempotente. El frontend lee siempre de aquí, nunca de
-- Holded directamente — la API key da R/W total y NO debe llegar al cliente.
--
-- También: tabla manual `manager_ventas_abuelo` para la frutería propia
-- (no factura por Holded), y log `manager_holded_sync`.
--
-- RLS: solo admin_full lee/escribe desde frontend. La Edge Function usa
-- service_role y bypass RLS para upsertar.
-- ============================================================================

create table if not exists public.manager_contactos (
  id              text primary key,                        -- id Holded
  nombre          text not null,
  nif             text,
  cp              text,
  poblacion       text,
  pais            text,
  raw             jsonb,
  updated_at      timestamptz not null default now()
);

create table if not exists public.manager_facturas (
  id                text primary key,                      -- id documento Holded
  tipo              text not null check (tipo in ('VENTA','COMPRA')),
  doc_number        text,
  contact_id        text references public.manager_contactos(id) on delete set null,
  contact_name      text,
  fecha             date,
  fecha_vencimiento date,
  descripcion       text,
  subtotal          numeric(12,2),
  impuestos         numeric(12,2),
  descuento         numeric(12,2),
  total             numeric(12,2),
  status            int,
  payments_total    numeric(12,2),
  payments_pending  numeric(12,2),
  payments_refunds  numeric(12,2),
  currency          text,
  tags              text[],
  raw               jsonb,
  updated_at        timestamptz not null default now()
);

create index if not exists manager_facturas_fecha_idx     on public.manager_facturas (fecha desc);
create index if not exists manager_facturas_tipo_idx      on public.manager_facturas (tipo, fecha desc);
create index if not exists manager_facturas_contact_idx   on public.manager_facturas (contact_id);

create table if not exists public.manager_lineas (
  id              text primary key,                        -- line_id Holded
  factura_id      text not null references public.manager_facturas(id) on delete cascade,
  tipo            text not null check (tipo in ('VENTA','COMPRA')),
  fecha           date,
  contact_id      text,
  nombre          text,
  nombre_raw      text,
  descripcion     text,
  sku             text,
  product_id      text,
  variant_id      text,
  cuenta          text,
  units           numeric(14,4),
  price           numeric(12,4),
  cost_price      numeric(12,4),
  tax_rate        numeric(5,2),
  discount        numeric(5,2),
  subtotal        numeric(12,2),
  raw             jsonb
);

create index if not exists manager_lineas_factura_idx on public.manager_lineas (factura_id);
create index if not exists manager_lineas_fecha_idx   on public.manager_lineas (tipo, fecha desc);
create index if not exists manager_lineas_product_idx on public.manager_lineas (product_id);

create table if not exists public.manager_holded_sync (
  id                  bigserial primary key,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  trigger             text not null check (trigger in ('manual','cron','backfill')),
  range_start         date,
  range_end           date,
  ventas_upserted     int default 0,
  compras_upserted    int default 0,
  contactos_upserted  int default 0,
  lineas_upserted     int default 0,
  ok                  boolean,
  error               text
);

create index if not exists manager_holded_sync_started_idx on public.manager_holded_sync (started_at desc);

create table if not exists public.manager_ventas_abuelo (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  importe     numeric(12,2) not null,
  nota        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists manager_ventas_abuelo_fecha_idx on public.manager_ventas_abuelo (fecha desc);

-- RLS: solo admin_full
alter table public.manager_contactos       enable row level security;
alter table public.manager_facturas        enable row level security;
alter table public.manager_lineas          enable row level security;
alter table public.manager_holded_sync     enable row level security;
alter table public.manager_ventas_abuelo   enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'manager_contactos',
      'manager_facturas',
      'manager_lineas',
      'manager_holded_sync',
      'manager_ventas_abuelo'
    ])
  loop
    execute format($f$
      drop policy if exists "manager: admin_full read" on public.%I;
      create policy "manager: admin_full read"
        on public.%I for select
        using (
          exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin_full'
          )
        );
    $f$, t, t);
  end loop;
end$$;

-- Sólo manager_ventas_abuelo permite escritura desde frontend (admin_full).
-- Las tablas de cache Holded sólo las escribe la Edge Function (service_role).
drop policy if exists "manager: admin_full write abuelo" on public.manager_ventas_abuelo;
create policy "manager: admin_full write abuelo"
  on public.manager_ventas_abuelo for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full')
  );
