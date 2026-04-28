-- ============================================================================
-- Abocados OS — Módulo Cash: cierre diario completo
-- ============================================================================
-- Una fila por día. Captura todo lo que el equipo cierra al final del día:
--   - Cobros: efectivo + tarjeta + otros (efectivo y tarjeta)
--   - Gastos: compras (Mercabarna), vehículos, otras compras, otros
--   - Deuda: la que se genera ese día y la que se cobra
--   - Operativa: pedidos, clientes nuevos, caja física al cierre
--
-- Totales (total_cobrado, total_gastos, resultado) son columnas GENERATED:
-- la BBDD los calcula y se mantienen consistentes sin lógica en la app.
-- La deuda acumulada se calcula en queries con SUM corriendo sobre fecha;
-- así no hay riesgo de descuadre por edición retroactiva.
--
-- RLS: admin_full + admin_op R/W. Empleados sin acceso (front lo bloquea).
-- ============================================================================

create table if not exists public.cierres (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null unique,

  efectivo        numeric(12,2) not null default 0,
  tarjeta         numeric(12,2) not null default 0,
  otros_efectivo  numeric(12,2) not null default 0,
  otros_tarjeta   numeric(12,2) not null default 0,

  compras         numeric(12,2) not null default 0,
  vehiculos       numeric(12,2) not null default 0,
  otras_compras   numeric(12,2) not null default 0,
  otros           numeric(12,2) not null default 0,

  deuda_generada  numeric(12,2) not null default 0,
  deuda_cobrada   numeric(12,2) not null default 0,

  pedidos         integer not null default 0,
  clientes_nuevos integer not null default 0,

  caja_fisica     numeric(12,2),
  observaciones   text,

  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  total_cobrado   numeric(12,2) generated always as
    (efectivo + tarjeta + otros_efectivo + otros_tarjeta) stored,
  total_gastos    numeric(12,2) generated always as
    (compras + vehiculos + otras_compras + otros) stored,
  resultado       numeric(12,2) generated always as
    ((efectivo + tarjeta + otros_efectivo + otros_tarjeta)
     - (compras + vehiculos + otras_compras + otros)) stored
);

create index if not exists idx_cierres_fecha on public.cierres(fecha);

drop trigger if exists trg_cierres_updated_at on public.cierres;
create trigger trg_cierres_updated_at
  before update on public.cierres
  for each row execute function public.touch_updated_at();

alter table public.cierres enable row level security;

drop policy if exists "cierres: admin R/W" on public.cierres;
create policy "cierres: admin R/W"
  on public.cierres for all
  using (public.is_admin())
  with check (public.is_admin());
