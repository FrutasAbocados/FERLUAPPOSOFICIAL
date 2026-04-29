-- ============================================================================
-- Cierre día por repartidor — jornadas + líneas (clientes asignados)
-- ============================================================================
-- Permite a admin_full / admin_op registrar al final del día qué repartidor
-- ha entregado a qué clientes, importe y forma de pago. Saldos derivados
-- (efectivo a entregar, total facturado, duración) se calculan en frontend.
-- ============================================================================

create table if not exists public.repartos_jornada (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  empleado_id  uuid not null references public.empleados(id) on delete restrict,
  hora_inicio  time,
  hora_fin     time,
  notas        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists repartos_jornada_fecha_idx
  on public.repartos_jornada (fecha desc);
create index if not exists repartos_jornada_empleado_idx
  on public.repartos_jornada (empleado_id, fecha desc);

create table if not exists public.repartos_jornada_lineas (
  id              uuid primary key default gen_random_uuid(),
  jornada_id      uuid not null references public.repartos_jornada(id) on delete cascade,
  contact_id      text references public.manager_contactos(id) on delete set null,
  contact_nombre  text not null,
  importe         numeric(10,2) not null check (importe >= 0),
  forma_pago      text not null check (forma_pago in ('efectivo','tarjeta')),
  orden           int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists repartos_jornada_lineas_jornada_idx
  on public.repartos_jornada_lineas (jornada_id, orden);

-- updated_at trigger
create or replace function public.repartos_jornada_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_repartos_jornada_updated_at on public.repartos_jornada;
create trigger trg_repartos_jornada_updated_at
  before update on public.repartos_jornada
  for each row execute function public.repartos_jornada_set_updated_at();

-- RLS
alter table public.repartos_jornada        enable row level security;
alter table public.repartos_jornada_lineas enable row level security;

drop policy if exists "repartos_jornada: admin all" on public.repartos_jornada;
create policy "repartos_jornada: admin all"
  on public.repartos_jornada for all
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  );

drop policy if exists "repartos_jornada_lineas: admin all" on public.repartos_jornada_lineas;
create policy "repartos_jornada_lineas: admin all"
  on public.repartos_jornada_lineas for all
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  );
