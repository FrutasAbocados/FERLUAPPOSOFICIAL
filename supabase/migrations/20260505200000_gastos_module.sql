-- ============================================================================
-- Módulo Gastos · Fijos (recurrentes) + Variables + Categorías + Proveedores
-- ============================================================================
-- Decisiones (2026-05-05):
--  · Pago manual + alerta 7 días antes
--  · Subtotal + IVA por separado, total generated
--  · Proveedores: reusar `manager_contactos` (Holded compras) + `gastos_proveedores_manuales` para los manuales
--  · Sin adjuntos PDF/foto — solo apunte numérico
--  · Permisos: admin_full + admin_op (vía helper `is_admin()`)
-- ============================================================================

-- 1) CATEGORÍAS (CRUD libre admin)
create table if not exists public.gastos_categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  color       text,
  icon        text,
  orden       int not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.gastos_categorias (nombre, color, orden) values
  ('Vehículos',     '#f59e0b', 10),
  ('Combustible',   '#ef4444', 20),
  ('Papelería',     '#3b82f6', 30),
  ('Suministros',   '#10b981', 40),
  ('Reparaciones',  '#a855f7', 50),
  ('Software',      '#06b6d4', 60),
  ('Limpieza',      '#84cc16', 70),
  ('Seguros',       '#f97316', 80),
  ('Impuestos',     '#dc2626', 90),
  ('Otros',         '#64748b', 99)
on conflict (nombre) do nothing;


-- 2) PROVEEDORES MANUALES (los que NO existen en manager_contactos / Holded)
create table if not exists public.gastos_proveedores_manuales (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  nif         text,
  notas       text,
  created_at  timestamptz not null default now()
);


-- 3) GASTOS FIJOS (recurrentes mensuales)
create table if not exists public.gastos_fijos (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null,
  importe                numeric(12,2) not null check (importe >= 0),
  iva_pct                numeric(5,2)  not null default 21 check (iva_pct >= 0 and iva_pct <= 100),
  dia_cargo              int not null check (dia_cargo between 1 and 31),
  categoria_id           uuid references public.gastos_categorias(id) on delete set null,
  proveedor_holded_id    text references public.manager_contactos(id) on delete set null,
  proveedor_manual_id    uuid references public.gastos_proveedores_manuales(id) on delete set null,
  metodo_pago            text,
  notas                  text,
  activo                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint gastos_fijos_proveedor_xor check (
    proveedor_holded_id is null or proveedor_manual_id is null
  )
);

create index if not exists gastos_fijos_activo_idx on public.gastos_fijos (activo) where activo = true;
create index if not exists gastos_fijos_categoria_idx on public.gastos_fijos (categoria_id);


-- 4) PAGOS DE FIJOS (uno por mes)
create table if not exists public.gastos_fijos_pagos (
  fijo_id      uuid not null references public.gastos_fijos(id) on delete cascade,
  anio         int  not null,
  mes          int  not null check (mes between 1 and 12),
  pagado_at    timestamptz,
  importe_real numeric(12,2),
  notas        text,
  marcado_por  uuid references auth.users(id) on delete set null,
  primary key (fijo_id, anio, mes)
);

create index if not exists gastos_fijos_pagos_periodo_idx on public.gastos_fijos_pagos (anio, mes);


-- 5) GASTOS VARIABLES
create table if not exists public.gastos_variables (
  id                     uuid primary key default gen_random_uuid(),
  fecha                  date not null,
  categoria_id           uuid references public.gastos_categorias(id) on delete set null,
  proveedor_holded_id    text references public.manager_contactos(id) on delete set null,
  proveedor_manual_id    uuid references public.gastos_proveedores_manuales(id) on delete set null,
  proveedor_libre        text,
  subtotal               numeric(12,2) not null check (subtotal >= 0),
  iva_pct                numeric(5,2)  not null default 21 check (iva_pct >= 0 and iva_pct <= 100),
  total                  numeric(12,2) generated always as (round(subtotal * (1 + iva_pct/100), 2)) stored,
  descripcion            text,
  metodo_pago            text,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint gastos_var_proveedor_xor check (
    (proveedor_holded_id is null or proveedor_manual_id is null)
  )
);

create index if not exists gastos_var_fecha_idx     on public.gastos_variables (fecha desc);
create index if not exists gastos_var_categoria_idx on public.gastos_variables (categoria_id);


-- 6) Trigger updated_at compartido
create or replace function public.gastos_touch_updated() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;

drop trigger if exists gastos_fijos_touch on public.gastos_fijos;
create trigger gastos_fijos_touch before update on public.gastos_fijos
  for each row execute function public.gastos_touch_updated();

drop trigger if exists gastos_variables_touch on public.gastos_variables;
create trigger gastos_variables_touch before update on public.gastos_variables
  for each row execute function public.gastos_touch_updated();


-- 7) RLS — solo admin (full + op)
alter table public.gastos_categorias            enable row level security;
alter table public.gastos_proveedores_manuales  enable row level security;
alter table public.gastos_fijos                 enable row level security;
alter table public.gastos_fijos_pagos           enable row level security;
alter table public.gastos_variables             enable row level security;

drop policy if exists "gastos_categorias: admin rw" on public.gastos_categorias;
create policy "gastos_categorias: admin rw" on public.gastos_categorias for all
  using (is_admin()) with check (is_admin());

drop policy if exists "gastos_proveedores_manuales: admin rw" on public.gastos_proveedores_manuales;
create policy "gastos_proveedores_manuales: admin rw" on public.gastos_proveedores_manuales for all
  using (is_admin()) with check (is_admin());

drop policy if exists "gastos_fijos: admin rw" on public.gastos_fijos;
create policy "gastos_fijos: admin rw" on public.gastos_fijos for all
  using (is_admin()) with check (is_admin());

drop policy if exists "gastos_fijos_pagos: admin rw" on public.gastos_fijos_pagos;
create policy "gastos_fijos_pagos: admin rw" on public.gastos_fijos_pagos for all
  using (is_admin()) with check (is_admin());

drop policy if exists "gastos_variables: admin rw" on public.gastos_variables;
create policy "gastos_variables: admin rw" on public.gastos_variables for all
  using (is_admin()) with check (is_admin());


-- ============================================================================
-- 8) RPCs base
-- ============================================================================

-- Calendario del mes: cada fijo con su fecha de cargo y estado de pago
drop function if exists public.gastos_calendario_mes(int, int);
create or replace function public.gastos_calendario_mes(p_anio int, p_mes int)
returns table (
  fijo_id           uuid,
  nombre            text,
  importe           numeric,
  iva_pct           numeric,
  total             numeric,
  dia_cargo         int,
  fecha_cargo       date,
  categoria_id      uuid,
  categoria_nombre  text,
  categoria_color   text,
  proveedor         text,
  metodo_pago       text,
  pagado_at         timestamptz,
  importe_real      numeric,
  estado            text
)
language sql security invoker stable as $$
  with base as (
    select
      g.id, g.nombre, g.importe, g.iva_pct,
      round(g.importe * (1 + g.iva_pct/100), 2)::numeric as total,
      g.dia_cargo, g.metodo_pago,
      g.categoria_id, c.nombre as categoria_nombre, c.color as categoria_color,
      coalesce(mc.nombre, gpm.nombre, '—') as proveedor
    from public.gastos_fijos g
    left join public.gastos_categorias c on c.id = g.categoria_id
    left join public.manager_contactos mc on mc.id = g.proveedor_holded_id
    left join public.gastos_proveedores_manuales gpm on gpm.id = g.proveedor_manual_id
    where g.activo = true
  ),
  ult_dia as (
    select extract(day from (date_trunc('month', make_date(p_anio, p_mes, 1)) + interval '1 month - 1 day'))::int as d
  ),
  with_date as (
    select b.*, make_date(p_anio, p_mes, least(b.dia_cargo, u.d)) as fecha_cargo
    from base b cross join ult_dia u
  )
  select
    w.id, w.nombre, w.importe, w.iva_pct, w.total, w.dia_cargo, w.fecha_cargo,
    w.categoria_id, w.categoria_nombre, w.categoria_color, w.proveedor, w.metodo_pago,
    p.pagado_at, p.importe_real,
    case
      when p.pagado_at is not null            then 'pagado'
      when w.fecha_cargo < current_date       then 'vencido'
      when w.fecha_cargo - current_date <= 7  then 'proximo'
      else 'futuro'
    end as estado
  from with_date w
  left join public.gastos_fijos_pagos p
    on p.fijo_id = w.id and p.anio = p_anio and p.mes = p_mes
  order by w.fecha_cargo asc, w.nombre asc;
$$;


-- Alertas: fijos vencidos o ≤7 días sin pagar (mes actual)
drop function if exists public.gastos_alertas_proximos_pagos();
create or replace function public.gastos_alertas_proximos_pagos()
returns table (
  fijo_id     uuid,
  nombre      text,
  total       numeric,
  fecha_cargo date,
  dias_para   int,
  estado      text
)
language sql security invoker stable as $$
  select c.fijo_id, c.nombre, c.total, c.fecha_cargo,
         (c.fecha_cargo - current_date)::int as dias_para,
         c.estado
  from public.gastos_calendario_mes(
    extract(year  from current_date)::int,
    extract(month from current_date)::int
  ) c
  where c.estado in ('vencido', 'proximo')
  order by c.fecha_cargo asc;
$$;


-- Serie mensual fijos+variables (para gráfico evolución)
drop function if exists public.gastos_serie_mensual(int);
create or replace function public.gastos_serie_mensual(p_meses int default 12)
returns table (
  anio            int,
  mes             int,
  mes_iso         date,
  fijos_total     numeric,
  variables_total numeric,
  total           numeric
)
language sql security invoker stable as $$
  with months as (
    select generate_series(
      (date_trunc('month', current_date) - make_interval(months => greatest(p_meses,1) - 1))::date,
      date_trunc('month', current_date)::date,
      interval '1 month'
    )::date as m
  ),
  fijos as (
    select p.anio, p.mes,
      sum(coalesce(p.importe_real, round(g.importe*(1+g.iva_pct/100),2)))::numeric as total
    from public.gastos_fijos_pagos p
    join public.gastos_fijos g on g.id = p.fijo_id
    where p.pagado_at is not null
    group by p.anio, p.mes
  ),
  vars as (
    select extract(year from fecha)::int as anio,
           extract(month from fecha)::int as mes,
           sum(total)::numeric as total
    from public.gastos_variables
    group by 1,2
  )
  select
    extract(year  from m)::int as anio,
    extract(month from m)::int as mes,
    m as mes_iso,
    coalesce(f.total, 0) as fijos_total,
    coalesce(v.total, 0) as variables_total,
    coalesce(f.total,0) + coalesce(v.total,0) as total
  from months
  left join fijos f on f.anio = extract(year from m)::int and f.mes = extract(month from m)::int
  left join vars  v on v.anio = extract(year from m)::int and v.mes = extract(month from m)::int
  order by m;
$$;


-- Resumen periodo (KPIs cabecera)
drop function if exists public.gastos_resumen_periodo(date, date);
create or replace function public.gastos_resumen_periodo(p_from date, p_to date)
returns table (
  total_fijos       numeric,
  total_variables   numeric,
  total             numeric,
  num_fijos_pagados int,
  num_variables     int
)
language sql security invoker stable as $$
  with fijos as (
    select
      sum(coalesce(p.importe_real, round(g.importe*(1+g.iva_pct/100),2)))::numeric as total,
      count(*)::int as n
    from public.gastos_fijos_pagos p
    join public.gastos_fijos g on g.id = p.fijo_id
    where p.pagado_at is not null
      and make_date(p.anio, p.mes, 1) between date_trunc('month', p_from)::date
                                          and date_trunc('month', p_to)::date
  ),
  vars as (
    select sum(total)::numeric as total, count(*)::int as n
    from public.gastos_variables
    where fecha between p_from and p_to
  )
  select
    coalesce(f.total, 0)::numeric,
    coalesce(v.total, 0)::numeric,
    (coalesce(f.total,0) + coalesce(v.total,0))::numeric,
    coalesce(f.n, 0),
    coalesce(v.n, 0)
  from fijos f, vars v;
$$;


-- Pivot dinámico: agrupa por una dimensión (mes|categoria|proveedor) en filas y opcionalmente otra en columnas
-- Para sesión 1: solo el resumen agrupado por una dimensión. La pivot real se hará en sesión 3.
drop function if exists public.gastos_agrupado(date, date, text);
create or replace function public.gastos_agrupado(p_from date, p_to date, p_dim text default 'categoria')
returns table (
  clave_id   text,
  clave      text,
  total      numeric,
  num        int
)
language sql security invoker stable as $$
  with vars as (
    select
      case p_dim
        when 'categoria' then coalesce(v.categoria_id::text, '_sin')
        when 'proveedor' then coalesce(v.proveedor_holded_id, v.proveedor_manual_id::text, v.proveedor_libre, '_sin')
        when 'mes'       then to_char(v.fecha, 'YYYY-MM')
        else 'all'
      end as clave_id,
      case p_dim
        when 'categoria' then coalesce(c.nombre, 'Sin categoría')
        when 'proveedor' then coalesce(mc.nombre, gpm.nombre, v.proveedor_libre, 'Sin proveedor')
        when 'mes'       then to_char(v.fecha, 'YYYY-MM')
        else 'Total'
      end as clave,
      v.total
    from public.gastos_variables v
    left join public.gastos_categorias c on c.id = v.categoria_id
    left join public.manager_contactos mc on mc.id = v.proveedor_holded_id
    left join public.gastos_proveedores_manuales gpm on gpm.id = v.proveedor_manual_id
    where v.fecha between p_from and p_to
  )
  select clave_id, clave, sum(total)::numeric as total, count(*)::int as num
  from vars
  group by clave_id, clave
  order by total desc;
$$;


grant execute on function public.gastos_calendario_mes(int, int)         to authenticated;
grant execute on function public.gastos_alertas_proximos_pagos()         to authenticated;
grant execute on function public.gastos_serie_mensual(int)               to authenticated;
grant execute on function public.gastos_resumen_periodo(date, date)      to authenticated;
grant execute on function public.gastos_agrupado(date, date, text)       to authenticated;
