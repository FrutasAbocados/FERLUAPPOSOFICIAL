-- Pedidos Tarde · Raúl
-- Ledger de facturas Holded gestionadas personalmente por Raúl.
-- Los saldos y repartos se calculan en frontend a partir de estas bases;
-- no se persisten acumulados derivados.

create or replace function public.es_raul_pedidos_tarde()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(p.email) = 'raulpedper@gmail.com'
  );
$$;

revoke all on function public.es_raul_pedidos_tarde() from public;
grant execute on function public.es_raul_pedidos_tarde() to authenticated;

create table if not exists public.trabajadores_pedidos_tarde_facturas (
  id uuid primary key default gen_random_uuid(),
  manager_factura_id text not null unique,
  numero_factura text not null,
  cliente text not null,
  fecha date not null,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  importe_total numeric(14, 2) not null check (importe_total >= 0),
  coste numeric(14, 2) not null default 0 check (coste >= 0),
  beneficio numeric(14, 2) not null,
  metodo_cobro text not null check (metodo_cobro in ('tarjeta', 'efectivo')),
  cobrada_cliente boolean not null default false,
  cobrada_at timestamp with time zone,
  liquidada_empresa boolean not null default false,
  liquidada_at timestamp with time zone,
  created_by uuid not null default auth.uid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint pedidos_tarde_cobro_fecha_check check (
    cobrada_cliente = (cobrada_at is not null)
  ),
  constraint pedidos_tarde_liquidacion_check check (
    liquidada_empresa = (liquidada_at is not null)
    and (not liquidada_empresa or cobrada_cliente)
  )
);

comment on table public.trabajadores_pedidos_tarde_facturas is
  'Facturas de pedidos de tarde gestionadas por Raúl. Importes congelados al añadir la factura desde Manager.';
comment on column public.trabajadores_pedidos_tarde_facturas.beneficio is
  'Margen canónico de Manager (subtotal sin IVA menos COGS) en el momento del alta.';
comment on column public.trabajadores_pedidos_tarde_facturas.coste is
  'COGS canónico de Manager en el momento del alta; se conserva como traza.';

create index if not exists trabajadores_pedidos_tarde_fecha_idx
  on public.trabajadores_pedidos_tarde_facturas (fecha desc);
create index if not exists trabajadores_pedidos_tarde_pendientes_idx
  on public.trabajadores_pedidos_tarde_facturas (cobrada_cliente, liquidada_empresa)
  where cobrada_cliente and not liquidada_empresa;

drop trigger if exists trabajadores_pedidos_tarde_touch on public.trabajadores_pedidos_tarde_facturas;
create trigger trabajadores_pedidos_tarde_touch
  before update on public.trabajadores_pedidos_tarde_facturas
  for each row execute function public.touch_updated_at();

alter table public.trabajadores_pedidos_tarde_facturas enable row level security;

drop policy if exists "pedidos_tarde: raul rw" on public.trabajadores_pedidos_tarde_facturas;
create policy "pedidos_tarde: raul rw"
  on public.trabajadores_pedidos_tarde_facturas
  for all
  to authenticated
  using (public.es_raul_pedidos_tarde())
  with check (
    public.es_raul_pedidos_tarde()
    and created_by = auth.uid()
  );

revoke all on public.trabajadores_pedidos_tarde_facturas from anon;
grant select, insert, update, delete on public.trabajadores_pedidos_tarde_facturas to authenticated;
