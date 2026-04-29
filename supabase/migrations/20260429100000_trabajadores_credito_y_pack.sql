-- ============================================================================
-- Trabajadores — pack contractual + Crédito frutas/verduras
-- ============================================================================
-- Pack 1 = 60d vacaciones + pluses + crédito frutas 100€/mes + productividad + 5% nuevos
-- Pack 2 = 48d vacaciones + sin pluses + 70€/sábado trabajado + 5% nuevos
--
-- Crédito frutas: solo pack 1. Cada empleado tiene límite mensual configurable.
-- Las "facturas internas" se anotan con líneas (catálogo Holded de Manager Abuelo).
-- Si en un mes superan el límite, el exceso se RESTA del límite del mes siguiente.
-- Histórico mensual con desglose de líneas al hacer click.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Pack contractual + límite crédito en empleados
-- ---------------------------------------------------------------------------
alter table public.empleados
  add column if not exists pack                    smallint not null default 1
    check (pack in (1, 2)),
  add column if not exists limite_credito_mensual  numeric(10, 2) default 100;

comment on column public.empleados.pack is
  '1 = pack completo (60d vac + pluses + crédito 100€). 2 = básico (48d vac + 70€/sábado).';
comment on column public.empleados.limite_credito_mensual is
  'Crédito mensual frutas/verduras (€). Solo aplica si pack=1. Default 100.';


-- ---------------------------------------------------------------------------
-- 2) Tablas de crédito
-- ---------------------------------------------------------------------------
create table if not exists public.trabajadores_credito_facturas (
  id           uuid primary key default gen_random_uuid(),
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  fecha        date not null default current_date,
  total        numeric(10, 2) not null default 0,
  nota         text,
  creado_por   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create index if not exists trab_credito_fact_empleado_fecha_idx
  on public.trabajadores_credito_facturas (empleado_id, fecha desc);

create table if not exists public.trabajadores_credito_lineas (
  id          uuid primary key default gen_random_uuid(),
  factura_id  uuid not null references public.trabajadores_credito_facturas(id) on delete cascade,
  product_id  text,
  nombre      text not null,
  units       numeric(12, 4) not null default 1,
  price       numeric(10, 4) not null default 0,
  subtotal    numeric(10, 2) generated always as (round((units * price)::numeric, 2)) stored,
  created_at  timestamptz not null default now()
);

create index if not exists trab_credito_lineas_factura_idx
  on public.trabajadores_credito_lineas (factura_id);


-- ---------------------------------------------------------------------------
-- 3) RLS — admin_full + admin_op (Luis y Álvaro)
-- ---------------------------------------------------------------------------
alter table public.trabajadores_credito_facturas enable row level security;
alter table public.trabajadores_credito_lineas   enable row level security;

drop policy if exists "credito facturas: admin rw" on public.trabajadores_credito_facturas;
create policy "credito facturas: admin rw"
  on public.trabajadores_credito_facturas for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  );

drop policy if exists "credito lineas: admin rw" on public.trabajadores_credito_lineas;
create policy "credito lineas: admin rw"
  on public.trabajadores_credito_lineas for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full', 'admin_op'))
  );


-- ---------------------------------------------------------------------------
-- 4) Función auxiliar: trigger que recalcula total de cabecera al cambiar líneas
-- ---------------------------------------------------------------------------
create or replace function public.trab_credito_recalcular_total()
returns trigger language plpgsql security definer as $$
declare
  v_factura uuid;
begin
  v_factura := coalesce(new.factura_id, old.factura_id);
  update public.trabajadores_credito_facturas f
  set total = coalesce((select sum(subtotal) from public.trabajadores_credito_lineas l where l.factura_id = v_factura), 0)
  where f.id = v_factura;
  return null;
end;
$$;

drop trigger if exists trab_credito_lineas_total on public.trabajadores_credito_lineas;
create trigger trab_credito_lineas_total
  after insert or update or delete on public.trabajadores_credito_lineas
  for each row execute function public.trab_credito_recalcular_total();


-- ---------------------------------------------------------------------------
-- 5) RPC: estado del crédito de un empleado para un mes dado
--    Calcula recursivamente el "exceso arrastrado" desde el primer mes con factura.
-- ---------------------------------------------------------------------------
create or replace function public.trabajadores_credito_estado_mes(
  p_empleado_id uuid,
  p_mes         date  -- cualquier día dentro del mes objetivo
)
returns table (
  limite_base       numeric,
  exceso_arrastrado numeric,
  gastado           numeric,
  disponible        numeric,
  exceso_nuevo      numeric
)
language plpgsql security invoker stable as $$
declare
  v_limite        numeric;
  v_exceso        numeric := 0;
  v_iter          date;
  v_mes_inicio    date := date_trunc('month', p_mes)::date;
  v_primer_mes    date;
  v_gastado       numeric;
  v_disponible    numeric;
begin
  select coalesce(limite_credito_mensual, 100) into v_limite
  from public.empleados where id = p_empleado_id;

  if v_limite is null then
    v_limite := 100;
  end if;

  -- Primer mes con factura (si no hay, no hay arrastre)
  select date_trunc('month', min(fecha))::date into v_primer_mes
  from public.trabajadores_credito_facturas
  where empleado_id = p_empleado_id;

  if v_primer_mes is not null and v_primer_mes < v_mes_inicio then
    for v_iter in
      select gs::date from generate_series(v_primer_mes, v_mes_inicio - interval '1 day', interval '1 month') gs
    loop
      select coalesce(sum(total), 0) into v_gastado
      from public.trabajadores_credito_facturas
      where empleado_id = p_empleado_id
        and fecha >= v_iter
        and fecha < (v_iter + interval '1 month');

      v_disponible := v_limite - v_exceso;
      if v_gastado > v_disponible then
        v_exceso := v_gastado - v_disponible;
      else
        v_exceso := 0;
      end if;
    end loop;
  end if;

  -- Mes actual
  select coalesce(sum(total), 0) into v_gastado
  from public.trabajadores_credito_facturas
  where empleado_id = p_empleado_id
    and fecha >= v_mes_inicio
    and fecha < (v_mes_inicio + interval '1 month');

  limite_base       := v_limite;
  exceso_arrastrado := v_exceso;
  gastado           := v_gastado;
  disponible        := v_limite - v_exceso - v_gastado;
  exceso_nuevo      := greatest(0, v_gastado - (v_limite - v_exceso));
  return next;
end;
$$;


-- ---------------------------------------------------------------------------
-- 6) RPC: histórico mensual de un empleado (todos sus meses)
--    Devuelve por mes: gastado, num_facturas, exceso arrastrado/nuevo, disponible.
-- ---------------------------------------------------------------------------
create or replace function public.trabajadores_credito_historico(
  p_empleado_id uuid
)
returns table (
  mes               date,
  limite_base       numeric,
  exceso_arrastrado numeric,
  gastado           numeric,
  num_facturas      bigint,
  disponible        numeric,
  exceso_nuevo      numeric
)
language plpgsql security invoker stable as $$
declare
  v_limite      numeric;
  v_exceso      numeric := 0;
  v_iter        date;
  v_primer_mes  date;
  v_ultimo_mes  date;
  v_gastado     numeric;
  v_num         bigint;
begin
  select coalesce(limite_credito_mensual, 100) into v_limite
  from public.empleados where id = p_empleado_id;
  if v_limite is null then v_limite := 100; end if;

  select date_trunc('month', min(fecha))::date into v_primer_mes
  from public.trabajadores_credito_facturas where empleado_id = p_empleado_id;

  if v_primer_mes is null then
    return;
  end if;

  v_ultimo_mes := date_trunc('month', current_date)::date;

  for v_iter in
    select gs::date from generate_series(v_primer_mes, v_ultimo_mes, interval '1 month') gs
  loop
    select coalesce(sum(total), 0), count(*) into v_gastado, v_num
    from public.trabajadores_credito_facturas
    where empleado_id = p_empleado_id
      and fecha >= v_iter
      and fecha < (v_iter + interval '1 month');

    mes               := v_iter;
    limite_base       := v_limite;
    exceso_arrastrado := v_exceso;
    gastado           := v_gastado;
    num_facturas      := v_num;
    disponible        := v_limite - v_exceso - v_gastado;
    exceso_nuevo      := greatest(0, v_gastado - (v_limite - v_exceso));
    return next;

    if v_gastado > (v_limite - v_exceso) then
      v_exceso := v_gastado - (v_limite - v_exceso);
    else
      v_exceso := 0;
    end if;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- 7) RPC: estado actual de TODOS los empleados pack 1 (para listado)
-- ---------------------------------------------------------------------------
create or replace function public.trabajadores_credito_estado_actual()
returns table (
  empleado_id       uuid,
  nombre            text,
  limite_base       numeric,
  exceso_arrastrado numeric,
  gastado           numeric,
  disponible        numeric,
  exceso_nuevo      numeric
)
language plpgsql security invoker stable as $$
#variable_conflict use_column
declare
  r record;
  e record;
begin
  for e in
    select emp.id as id, emp.nombre as nombre
    from public.empleados emp
    where emp.activo = true and emp.pack = 1
    order by emp.nombre
  loop
    select * into r from public.trabajadores_credito_estado_mes(e.id, current_date);
    return query select
      e.id,
      e.nombre,
      r.limite_base,
      r.exceso_arrastrado,
      r.gastado,
      r.disponible,
      r.exceso_nuevo;
  end loop;
end;
$$;
