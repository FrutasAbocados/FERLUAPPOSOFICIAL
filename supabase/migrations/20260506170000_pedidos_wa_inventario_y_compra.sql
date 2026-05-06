-- Inventario del día (texto pegado por Luis + parseado a líneas)
create table if not exists public.pedidos_wa_inventario (
  fecha date primary key,
  texto_original text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pedidos_wa_inventario_lineas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null references public.pedidos_wa_inventario(fecha) on delete cascade,
  orden int not null default 0,
  producto_normalizado text not null,
  unidad text not null,
  cantidad numeric not null,
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists pedidos_wa_inventario_lineas_fecha_idx
  on public.pedidos_wa_inventario_lineas (fecha);

create index if not exists pedidos_wa_inventario_lineas_prod_idx
  on public.pedidos_wa_inventario_lineas (producto_normalizado);

-- Factor kg/caja por producto (default 10, excepciones tabuladas)
create table if not exists public.pedidos_wa_kg_por_caja (
  producto_normalizado text primary key,
  kg_por_caja numeric not null check (kg_por_caja > 0),
  updated_at timestamptz not null default now()
);

-- Seed: pimientos en sus variantes principales
insert into public.pedidos_wa_kg_por_caja (producto_normalizado, kg_por_caja) values
  ('pimiento',           6),
  ('pimientos',          6),
  ('pimiento rojo',      6),
  ('pimiento verde',     6),
  ('pimiento amarillo',  6),
  ('pimiento italiano',  6),
  ('pimiento padron',    6),
  ('pimiento padrón',    6)
on conflict (producto_normalizado) do nothing;

drop trigger if exists trg_pedidos_wa_inventario_updated_at on public.pedidos_wa_inventario;
create trigger trg_pedidos_wa_inventario_updated_at
  before update on public.pedidos_wa_inventario
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_pedidos_wa_kg_por_caja_updated_at on public.pedidos_wa_kg_por_caja;
create trigger trg_pedidos_wa_kg_por_caja_updated_at
  before update on public.pedidos_wa_kg_por_caja
  for each row execute function public.touch_updated_at();

alter table public.pedidos_wa_inventario        enable row level security;
alter table public.pedidos_wa_inventario_lineas enable row level security;
alter table public.pedidos_wa_kg_por_caja       enable row level security;

drop policy if exists "pedidos_wa_inventario: admin all" on public.pedidos_wa_inventario;
create policy "pedidos_wa_inventario: admin all"
  on public.pedidos_wa_inventario for all
  using (is_admin()) with check (is_admin());
drop policy if exists "pedidos_wa_inventario: responsable read" on public.pedidos_wa_inventario;
create policy "pedidos_wa_inventario: responsable read"
  on public.pedidos_wa_inventario for select
  using (es_responsable());

drop policy if exists "pedidos_wa_inventario_lineas: admin all" on public.pedidos_wa_inventario_lineas;
create policy "pedidos_wa_inventario_lineas: admin all"
  on public.pedidos_wa_inventario_lineas for all
  using (is_admin()) with check (is_admin());
drop policy if exists "pedidos_wa_inventario_lineas: responsable read" on public.pedidos_wa_inventario_lineas;
create policy "pedidos_wa_inventario_lineas: responsable read"
  on public.pedidos_wa_inventario_lineas for select
  using (es_responsable());

drop policy if exists "pedidos_wa_kg_por_caja: admin all" on public.pedidos_wa_kg_por_caja;
create policy "pedidos_wa_kg_por_caja: admin all"
  on public.pedidos_wa_kg_por_caja for all
  using (is_admin()) with check (is_admin());
drop policy if exists "pedidos_wa_kg_por_caja: responsable read" on public.pedidos_wa_kg_por_caja;
create policy "pedidos_wa_kg_por_caja: responsable read"
  on public.pedidos_wa_kg_por_caja for select
  using (es_responsable());
