-- ============================================================================
-- Abocados OS — Módulo Tesorería
-- ============================================================================
-- Modelo:
--   - cuentas: bancarias / efectivo / líneas de crédito. Tienen `saldo_inicial`
--     (snapshot manual al crear la cuenta). El saldo real se calcula en queries
--     como saldo_inicial + SUM(movimientos.importe), MISMO PATRÓN que la
--     deuda_acum de Cash. No se almacena el saldo "actual" para evitar
--     descuadres por edición retroactiva.
--   - movimientos: una fila por movimiento bancario/de caja, importe SIGNED
--     (+ ingreso, - gasto). El usuario los introduce a mano.
--   - pagos: lista de pagos a proveedores (vencimiento + estado). Independiente
--     de movimientos: cuando el usuario paga uno, decide manualmente si añade
--     un movimiento.
--   - gastos_fijos: recurrentes mensuales (concepto + día del mes + importe).
--
-- RLS:
--   - admin_full: R/W en todo
--   - admin_op:   solo SELECT (consistente con la matriz de permisos)
--   - empleado:   sin acceso (front lo bloquea, sin policy aquí)
-- ============================================================================

-- 1. Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tesoreria_cuenta_tipo') then
    create type public.tesoreria_cuenta_tipo as enum ('corriente', 'efectivo', 'credito');
  end if;
  if not exists (select 1 from pg_type where typname = 'tesoreria_pago_estado') then
    create type public.tesoreria_pago_estado as enum ('pendiente', 'pagado', 'cancelado');
  end if;
end$$;

-- 2. Cuentas
create table if not exists public.tesoreria_cuentas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  tipo            public.tesoreria_cuenta_tipo not null default 'corriente',
  saldo_inicial   numeric(14,2) not null default 0,
  limite_credito  numeric(14,2),
  activo          boolean not null default true,
  orden           integer not null default 0,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_tes_cuentas_updated_at on public.tesoreria_cuentas;
create trigger trg_tes_cuentas_updated_at
  before update on public.tesoreria_cuentas
  for each row execute function public.touch_updated_at();

-- 3. Movimientos (saldo se calcula sumando éstos al saldo_inicial de la cuenta)
create table if not exists public.tesoreria_movimientos (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references public.tesoreria_cuentas(id) on delete cascade,
  fecha       date not null,
  importe     numeric(14,2) not null,
  concepto    text not null,
  categoria   text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tes_mov_cuenta on public.tesoreria_movimientos(cuenta_id);
create index if not exists idx_tes_mov_fecha on public.tesoreria_movimientos(fecha);

drop trigger if exists trg_tes_mov_updated_at on public.tesoreria_movimientos;
create trigger trg_tes_mov_updated_at
  before update on public.tesoreria_movimientos
  for each row execute function public.touch_updated_at();

-- 4. Pagos pendientes
create table if not exists public.tesoreria_pagos (
  id                 uuid primary key default gen_random_uuid(),
  cuenta_id          uuid references public.tesoreria_cuentas(id) on delete set null,
  proveedor          text not null,
  concepto           text,
  importe            numeric(14,2) not null check (importe > 0),
  fecha_vencimiento  date not null,
  estado             public.tesoreria_pago_estado not null default 'pendiente',
  fecha_pago         date,
  notas              text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_tes_pagos_estado on public.tesoreria_pagos(estado);
create index if not exists idx_tes_pagos_venc on public.tesoreria_pagos(fecha_vencimiento);

drop trigger if exists trg_tes_pagos_updated_at on public.tesoreria_pagos;
create trigger trg_tes_pagos_updated_at
  before update on public.tesoreria_pagos
  for each row execute function public.touch_updated_at();

-- 5. Gastos fijos recurrentes
create table if not exists public.tesoreria_gastos_fijos (
  id          uuid primary key default gen_random_uuid(),
  concepto    text not null,
  importe     numeric(14,2) not null check (importe > 0),
  dia_mes     smallint not null check (dia_mes between 1 and 31),
  cuenta_id   uuid references public.tesoreria_cuentas(id) on delete set null,
  activo      boolean not null default true,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_tes_fijos_updated_at on public.tesoreria_gastos_fijos;
create trigger trg_tes_fijos_updated_at
  before update on public.tesoreria_gastos_fijos
  for each row execute function public.touch_updated_at();

-- 6. RLS
alter table public.tesoreria_cuentas         enable row level security;
alter table public.tesoreria_movimientos     enable row level security;
alter table public.tesoreria_pagos           enable row level security;
alter table public.tesoreria_gastos_fijos    enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['tesoreria_cuentas','tesoreria_movimientos','tesoreria_pagos','tesoreria_gastos_fijos']) loop
    -- SELECT: admin_full + admin_op
    execute format('drop policy if exists "%s: select admin" on public.%I;', t, t);
    execute format('create policy "%s: select admin" on public.%I for select using (public.is_admin());', t, t);
    -- ALL ops: admin_full only
    execute format('drop policy if exists "%s: write admin_full" on public.%I;', t, t);
    execute format('create policy "%s: write admin_full" on public.%I for all using (public.is_admin_full()) with check (public.is_admin_full());', t, t);
  end loop;
end$$;
