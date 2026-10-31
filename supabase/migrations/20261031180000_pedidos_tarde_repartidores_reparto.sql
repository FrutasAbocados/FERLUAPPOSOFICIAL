-- Pedidos Tarde para varios repartidores (Raúl y Alex) + reparto del margen
-- congelado por factura.
--
-- Regla (Luis, 2026-10-31):
--   * Facturas con fecha < 2026-11-01: 80 % repartidor / 20 % empresa.
--   * Desde 2026-11-01: 15 % Luis / 15 % Álvaro / 20 % impuesto / 50 % repartidor.
--   * Tarjeta: la empresa debe al repartidor su parte.
--     Efectivo: el repartidor debe a la empresa el total menos su parte.
-- El repartidor es quien incorpora la factura (created_by). Cada repartidor
-- solo ve y gestiona lo suyo; administración ve todo en solo lectura.

-- 1. Repartidores habilitados ------------------------------------------------
create or replace function public.es_repartidor_pedidos_tarde()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- auth.users y no profiles: cada usuario puede editar su propio profiles.email.
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(u.email) in ('raulpedper@gmail.com', 'alexpowerplay@gmail.com')
  );
$$;

revoke all on function public.es_repartidor_pedidos_tarde() from public, anon;
grant execute on function public.es_repartidor_pedidos_tarde() to authenticated;

-- 2. Porcentajes congelados por factura --------------------------------------
-- Las filas existentes (todas anteriores a noviembre) quedan con 80/20.
alter table public.trabajadores_pedidos_tarde_facturas
  add column if not exists pct_repartidor numeric(5, 2) not null default 80,
  add column if not exists pct_luis numeric(5, 2) not null default 0,
  add column if not exists pct_alvaro numeric(5, 2) not null default 0,
  add column if not exists pct_impuesto numeric(5, 2) not null default 0,
  add column if not exists pct_empresa numeric(5, 2) not null default 20;

alter table public.trabajadores_pedidos_tarde_facturas
  drop constraint if exists pedidos_tarde_reparto_suma_100;
alter table public.trabajadores_pedidos_tarde_facturas
  add constraint pedidos_tarde_reparto_suma_100 check (
    pct_repartidor >= 0 and pct_luis >= 0 and pct_alvaro >= 0
    and pct_impuesto >= 0 and pct_empresa >= 0
    and pct_repartidor + pct_luis + pct_alvaro + pct_impuesto + pct_empresa = 100
  );

-- Si se incorporó alguna factura de noviembre antes de aplicar esta migración,
-- recibe el reparto nuevo. Va antes de redefinir el trigger de protección
-- (la versión vigente todavía no vigila los porcentajes).
update public.trabajadores_pedidos_tarde_facturas
set pct_repartidor = 50, pct_luis = 15, pct_alvaro = 15, pct_impuesto = 20, pct_empresa = 0
where fecha >= date '2026-11-01' and pct_empresa <> 0;

comment on column public.trabajadores_pedidos_tarde_facturas.pct_repartidor is
  'Porcentaje del margen para el repartidor (created_by). Fijado al alta según la fecha de la factura.';
comment on column public.trabajadores_pedidos_tarde_facturas.pct_impuesto is
  'Porcentaje del margen reservado para impuestos (desde 2026-11-01).';

-- Al dar de alta, la base de datos ignora lo que manda el cliente: copia la
-- factura de Manager, recalcula coste/margen con el mismo origen que
-- manager_factura_detalle y fija el reparto por la fecha de la factura.
create or replace function public.trabajadores_pedidos_tarde_fijar_reparto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura record;
  v_coste numeric;
  v_beneficio numeric;
begin
  select f.doc_number, f.contact_name, f.fecha, f.subtotal, f.total
    into v_factura
  from public.manager_facturas f
  where f.id = new.manager_factura_id
    and f.tipo = 'VENTA'
    and f.doc_number is not null;

  if not found then
    raise exception 'Factura % no encontrada en Manager', new.manager_factura_id;
  end if;

  select round(coalesce(sum(l.cogs_linea), 0), 2), round(coalesce(sum(l.margen_linea), 0), 2)
    into v_coste, v_beneficio
  from public.manager_lineas_coste_resuelto l
  where l.factura_id = new.manager_factura_id;

  new.numero_factura := v_factura.doc_number;
  new.cliente := coalesce(v_factura.contact_name, '(sin cliente)');
  new.fecha := v_factura.fecha;
  new.subtotal := v_factura.subtotal;
  new.importe_total := v_factura.total;
  new.coste := v_coste;
  new.beneficio := v_beneficio;

  if new.fecha >= date '2026-11-01' then
    new.pct_repartidor := 50;
    new.pct_luis := 15;
    new.pct_alvaro := 15;
    new.pct_impuesto := 20;
    new.pct_empresa := 0;
  else
    new.pct_repartidor := 80;
    new.pct_luis := 0;
    new.pct_alvaro := 0;
    new.pct_impuesto := 0;
    new.pct_empresa := 20;
  end if;
  return new;
end;
$$;

revoke all on function public.trabajadores_pedidos_tarde_fijar_reparto() from public, anon, authenticated;

drop trigger if exists trabajadores_pedidos_tarde_fijar_reparto
  on public.trabajadores_pedidos_tarde_facturas;
create trigger trabajadores_pedidos_tarde_fijar_reparto
  before insert on public.trabajadores_pedidos_tarde_facturas
  for each row execute function public.trabajadores_pedidos_tarde_fijar_reparto();

-- Los porcentajes se congelan igual que los importes.
create or replace function public.trabajadores_pedidos_tarde_proteger_factura()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(
    new.manager_factura_id, new.numero_factura, new.cliente, new.fecha,
    new.subtotal, new.importe_total, new.coste, new.beneficio,
    new.created_by, new.created_at,
    new.pct_repartidor, new.pct_luis, new.pct_alvaro, new.pct_impuesto, new.pct_empresa
  ) is distinct from row(
    old.manager_factura_id, old.numero_factura, old.cliente, old.fecha,
    old.subtotal, old.importe_total, old.coste, old.beneficio,
    old.created_by, old.created_at,
    old.pct_repartidor, old.pct_luis, old.pct_alvaro, old.pct_impuesto, old.pct_empresa
  ) then
    raise exception 'La factura confirmada es inmutable';
  end if;
  return new;
end;
$$;

-- 3. RLS: cada repartidor lo suyo, administración todo ------------------------
drop policy if exists "pedidos_tarde: raul or admin read" on public.trabajadores_pedidos_tarde_facturas;
drop policy if exists "pedidos_tarde: raul insert" on public.trabajadores_pedidos_tarde_facturas;
drop policy if exists "pedidos_tarde: raul update" on public.trabajadores_pedidos_tarde_facturas;
drop policy if exists "pedidos_tarde: repartidor o admin read" on public.trabajadores_pedidos_tarde_facturas;
drop policy if exists "pedidos_tarde: repartidor insert" on public.trabajadores_pedidos_tarde_facturas;
drop policy if exists "pedidos_tarde: repartidor update" on public.trabajadores_pedidos_tarde_facturas;

create policy "pedidos_tarde: repartidor o admin read"
  on public.trabajadores_pedidos_tarde_facturas for select
  to authenticated
  using (
    (select public.is_admin())
    or (
      (select public.es_repartidor_pedidos_tarde())
      and created_by = (select auth.uid())
    )
  );

create policy "pedidos_tarde: repartidor insert"
  on public.trabajadores_pedidos_tarde_facturas for insert
  to authenticated
  with check (
    (select public.es_repartidor_pedidos_tarde())
    and created_by = (select auth.uid())
  );

create policy "pedidos_tarde: repartidor update"
  on public.trabajadores_pedidos_tarde_facturas for update
  to authenticated
  using (
    (select public.es_repartidor_pedidos_tarde())
    and created_by = (select auth.uid())
  )
  with check (
    (select public.es_repartidor_pedidos_tarde())
    and created_by = (select auth.uid())
  );

comment on table public.trabajadores_pedidos_tarde_facturas is
  'Facturas de pedidos de tarde gestionadas por cada repartidor (created_by). Importes y reparto congelados al alta.';
