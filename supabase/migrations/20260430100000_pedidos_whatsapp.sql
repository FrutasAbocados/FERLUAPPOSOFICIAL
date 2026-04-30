-- ============================================================================
-- Pedidos WhatsApp — parser + hoja de ruta de los 25 hostelería
-- ============================================================================
-- Cliente extension table con metadata de ruta (repartidor, horario,
-- tipo_factura, salida) que NO existe en manager_contactos. Pedido (cabecera +
-- líneas) almacena el mensaje original íntegro y las líneas estructuradas con
-- método de parseo para auditoría. Diccionario de abreviaturas editable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Clientes hostelería (extensión local con metadata de ruta)
-- ---------------------------------------------------------------------------
create table if not exists public.pedidos_wa_clientes (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null unique,
  nombre_normalizado  text not null,
  holded_contact_id   text references public.manager_contactos(id) on delete set null,
  repartidor          text not null check (repartidor in ('TORRES','GERMAN','RAUL','ALEX')),
  horario             text,
  tipo_factura        text not null default 'HOLDED' check (tipo_factura in ('HOLDED','DRIVE','NINGUNA')),
  salida              text check (salida in ('PRIMERA','SEGUNDA')),
  subseccion_default  text,
  notas               text,
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists pedidos_wa_clientes_repartidor_idx
  on public.pedidos_wa_clientes (repartidor, horario);
create index if not exists pedidos_wa_clientes_norm_idx
  on public.pedidos_wa_clientes (nombre_normalizado);

drop trigger if exists trg_pedidos_wa_clientes_updated_at on public.pedidos_wa_clientes;
create trigger trg_pedidos_wa_clientes_updated_at
  before update on public.pedidos_wa_clientes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2) Pedido cabecera
-- ---------------------------------------------------------------------------
create table if not exists public.pedidos_wa (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.pedidos_wa_clientes(id) on delete restrict,
  fecha           date not null default current_date,
  texto_original  text not null,
  notas_admin     text,
  faltas          text,
  estado          text not null default 'pendiente'
                    check (estado in ('pendiente','preparado','entregado','cancelado')),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists pedidos_wa_fecha_idx
  on public.pedidos_wa (fecha desc);
create index if not exists pedidos_wa_cliente_fecha_idx
  on public.pedidos_wa (cliente_id, fecha desc);

drop trigger if exists trg_pedidos_wa_updated_at on public.pedidos_wa;
create trigger trg_pedidos_wa_updated_at
  before update on public.pedidos_wa
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3) Líneas de pedido
-- ---------------------------------------------------------------------------
create table if not exists public.pedidos_wa_lineas (
  id                    uuid primary key default gen_random_uuid(),
  pedido_id             uuid not null references public.pedidos_wa(id) on delete cascade,
  orden                 int not null,
  cantidad              numeric(10,3) not null,
  unidad                text not null check (unidad in (
                          'caja','caja_pequena','kg','saco','bolsa',
                          'manojo','bandeja','lecho','carton','unidad'
                        )),
  producto_normalizado  text not null,
  producto_raw          text not null,
  subseccion            text,
  notas                 text,
  es_gratis             boolean not null default false,
  metodo                text not null check (metodo in ('regex','claude','manual')),
  created_at            timestamptz not null default now()
);

create index if not exists pedidos_wa_lineas_pedido_idx
  on public.pedidos_wa_lineas (pedido_id, orden);

-- ---------------------------------------------------------------------------
-- 4) Diccionario de abreviaturas (editable)
-- ---------------------------------------------------------------------------
create table if not exists public.pedidos_wa_abreviaturas (
  id                    uuid primary key default gen_random_uuid(),
  abreviatura           text not null unique,
  producto_normalizado  text not null,
  creada_por_user       boolean not null default false,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5) RLS — admin_full + admin_op CRUD; responsable lectura
-- ---------------------------------------------------------------------------
alter table public.pedidos_wa_clientes      enable row level security;
alter table public.pedidos_wa               enable row level security;
alter table public.pedidos_wa_lineas        enable row level security;
alter table public.pedidos_wa_abreviaturas  enable row level security;

-- pedidos_wa_clientes
drop policy if exists "pedidos_wa_clientes: admin all" on public.pedidos_wa_clientes;
create policy "pedidos_wa_clientes: admin all"
  on public.pedidos_wa_clientes for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pedidos_wa_clientes: responsable read" on public.pedidos_wa_clientes;
create policy "pedidos_wa_clientes: responsable read"
  on public.pedidos_wa_clientes for select
  using (public.es_responsable());

-- pedidos_wa
drop policy if exists "pedidos_wa: admin all" on public.pedidos_wa;
create policy "pedidos_wa: admin all"
  on public.pedidos_wa for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pedidos_wa: responsable read" on public.pedidos_wa;
create policy "pedidos_wa: responsable read"
  on public.pedidos_wa for select
  using (public.es_responsable());

-- pedidos_wa_lineas
drop policy if exists "pedidos_wa_lineas: admin all" on public.pedidos_wa_lineas;
create policy "pedidos_wa_lineas: admin all"
  on public.pedidos_wa_lineas for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pedidos_wa_lineas: responsable read" on public.pedidos_wa_lineas;
create policy "pedidos_wa_lineas: responsable read"
  on public.pedidos_wa_lineas for select
  using (public.es_responsable());

-- pedidos_wa_abreviaturas (todos los autenticados con rol válido pueden leer)
drop policy if exists "pedidos_wa_abreviaturas: admin all" on public.pedidos_wa_abreviaturas;
create policy "pedidos_wa_abreviaturas: admin all"
  on public.pedidos_wa_abreviaturas for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pedidos_wa_abreviaturas: read autenticados" on public.pedidos_wa_abreviaturas;
create policy "pedidos_wa_abreviaturas: read autenticados"
  on public.pedidos_wa_abreviaturas for select
  using (public.is_admin() or public.es_responsable());

-- ---------------------------------------------------------------------------
-- 6) Seed — 25 clientes hostelería
-- ---------------------------------------------------------------------------
insert into public.pedidos_wa_clientes
  (nombre, nombre_normalizado, repartidor, horario, tipo_factura, salida, subseccion_default, notas)
values
  -- TORRES (salida única)
  ('DAK BURGUER',              'dak burguer',              'TORRES',  '08:00', 'HOLDED',  null, null, null),
  ('HOLLYWOOD',                'hollywood',                'TORRES',  '08:30', 'HOLDED',  null, null, null),
  ('CASA DIEGO',               'casa diego',               'TORRES',  '09:00', 'HOLDED',  null, null, null),
  ('YOLE HELADERIA',           'yole heladeria',           'TORRES',  '09:15', 'HOLDED',  null, null, null),
  ('CASA ROBERTO',             'casa roberto',             'TORRES',  '09:30', 'HOLDED',  null, null, null),
  ('COLINA DEL FARO',          'colina del faro',          'TORRES',  '10:00', 'HOLDED',  null, null, null),
  ('BLACKBERRY',               'blackberry',               'TORRES',  '10:20', 'HOLDED',  null, 'ANDREA', null),
  ('CLUB NAUTICO',             'club nautico',             'TORRES',  '10:40', 'HOLDED',  null, null, null),
  ('BAR REPIPI',               'bar repipi',               'TORRES',  '11:00', 'HOLDED',  null, null, null),
  ('VERDIALES',                'verdiales',                'TORRES',  '11:30', 'HOLDED',  null, null, null),

  -- GERMAN — 1ª salida
  ('BAR BETIS',                'bar betis',                'GERMAN',  '07:45', 'HOLDED',  'PRIMERA', null, null),
  ('BERIGÚ',                   'berigu',                   'GERMAN',  '08:00', 'HOLDED',  'PRIMERA', null,
    'COBRAR FACT ANTERIOR — verificar en cada pedido'),
  ('EL ABUELO',                'el abuelo',                'GERMAN',  '08:45', 'DRIVE',   'PRIMERA', null, null),
  ('CASI CASI CAFETERÍA',      'casi casi cafeteria',      'GERMAN',  '09:20', 'HOLDED',  'PRIMERA', null, null),
  ('VICTOR BEACH',             'victor beach',             'GERMAN',  '10:00', 'HOLDED',  'PRIMERA', null, null),
  ('VICTOR COCKTAIL',          'victor cocktail',          'GERMAN',  '10:00', 'HOLDED',  'PRIMERA', null, null),
  ('RICHYS FOOD',              'richys food',              'GERMAN',  '10:30', 'HOLDED',  'PRIMERA', null, null),
  ('CHIRINGUITO LOS MORENOS',  'chiringuito los morenos',  'GERMAN',  '10:45', 'HOLDED',  'PRIMERA', null, null),

  -- GERMAN — 2ª salida
  ('LA PAERETA',               'la paereta',               'GERMAN',  '12:00', 'HOLDED',  'SEGUNDA', null, null),
  ('DON SANTIAGO',             'don santiago',             'GERMAN',  '12:20', 'HOLDED',  'SEGUNDA', null, null),

  -- RAUL — 1ª salida
  ('LOS BROCALES',             'los brocales',             'RAUL',    '09:30', 'HOLDED',  'PRIMERA', null, null),
  ('CASA PACO',                'casa paco',                'RAUL',    '10:15', 'HOLDED',  'PRIMERA', null, null),
  ('CHAROLAIS',                'charolais',                'RAUL',    '11:00', 'HOLDED',  'PRIMERA', null, null),

  -- RAUL — 2ª salida
  ('LA CATEDRAL',              'la catedral',              'RAUL',    '12:30', 'HOLDED',  'SEGUNDA', null,
    'HABLAR CON SALVIO PARA COBRAR'),
  ('RESTAURANTE EL GOLF',      'restaurante el golf',      'RAUL',    '13:00', 'HOLDED',  'SEGUNDA', null, null)
on conflict (nombre) do update set
  nombre_normalizado = excluded.nombre_normalizado,
  repartidor         = excluded.repartidor,
  horario            = excluded.horario,
  tipo_factura       = excluded.tipo_factura,
  salida             = excluded.salida,
  subseccion_default = excluded.subseccion_default,
  notas              = excluded.notas,
  updated_at         = now();

-- ---------------------------------------------------------------------------
-- 7) Seed — diccionario de abreviaturas
-- ---------------------------------------------------------------------------
insert into public.pedidos_wa_abreviaturas (abreviatura, producto_normalizado) values
  ('pim',              'Pimiento'),
  ('pim rojo',         'Pimiento rojo california'),
  ('pim verde',        'Pimiento verde california'),
  ('pim italiano',     'Pimiento italiano'),
  ('pim padron',       'Pimiento de padrón'),
  ('tom',              'Tomate'),
  ('tom pera',         'Tomate pera'),
  ('tomate pera',      'Tomate pera'),
  ('daniela',          'Tomate daniela'),
  ('cherry',           'Tomate cherry'),
  ('huevo toro',       'Tomate huevo de toro'),
  ('rosa',             'Tomate rosa'),
  ('iceberg',          'Lechuga iceberg'),
  ('romana',           'Lechuga romana'),
  ('champi',           'Champiñón entero'),
  ('champi laminado',  'Champiñón laminado'),
  ('rucula',           'Rúcula'),
  ('canonigos',        'Canónigos'),
  ('mezclum',          'Mezclum'),
  ('micromezclum',     'Micromezclum'),
  ('micro mezclum',    'Micromezclum'),
  ('baby leaf',        'Baby leaf'),
  ('escarola',         'Escarola'),
  ('cogollo',          'Cogollos cortos'),
  ('cogollos',         'Cogollos cortos'),
  ('cogollo corto',    'Cogollos cortos'),
  ('cogollos cortos',  'Cogollos cortos'),
  ('cogollos largos',  'Cogollos largos'),
  ('nueva',            'Patata nueva'),
  ('torcal',           'Patata torcal'),
  ('monalisa',         'Patata monalisa'),
  ('agria',            'Patata agria negra'),
  ('agria negra',      'Patata agria negra'),
  ('agria negro',      'Patata agria negra'),
  ('ajo pelado',       'Ajo pelado'),
  ('judia bobby',      'Judía bobby'),
  ('judia',            'Judía'),
  ('platanos',         'Plátano canario'),
  ('banana',           'Banana'),
  ('bananas',          'Banana')
on conflict (abreviatura) do update set
  producto_normalizado = excluded.producto_normalizado;
