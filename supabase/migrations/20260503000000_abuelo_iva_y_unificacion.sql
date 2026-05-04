-- ============================================================================
-- Abuelo: IVA por línea (4/10/21) + espejado a manager_facturas/lineas
-- ============================================================================
-- Cambios:
--   1) Añade tax_rate a manager_lineas_abuelo (default 4 — frutas/verduras).
--   2) Reescribe la RPC manager_abuelo_factura_create:
--        - Precio de línea AHORA es SIN IVA (cambio semántico vs. versión previa).
--        - subtotal_factura = sum(units*price)
--        - total_factura    = sum(units*price * (1 + tax_rate/100))
--        - Espeja la factura en manager_facturas con subtipo='abuelo' y un
--          contact_name fijo, y sus líneas en manager_lineas con tax_rate.
--          A partir de aquí, las 28 RPCs que agregan ventas (KPIs, resumen,
--          patrones, top clientes, calendario, heatmap) la incluyen automáticamente.
--   3) Trigger AFTER DELETE on manager_ventas_abuelo limpia el espejo
--      (manager_lineas cascadea desde manager_facturas).
--   4) Recalcula las 2 facturas existentes asumiendo tax 4% — antes el código
--      guardaba `total = sum(units*price)` y `subtotal = total/1.04`, ahora
--      se invierte: subtotal = ese valor, total = subtotal * 1.04.
--   5) Backfill: espejar las 2 facturas existentes en manager_facturas/lineas.
--   6) Extiende manager_catalogo_productos para devolver tax_rate_ultimo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Schema: tax_rate por línea Abuelo
-- ---------------------------------------------------------------------------
alter table public.manager_lineas_abuelo
  add column if not exists tax_rate numeric not null default 4
  check (tax_rate in (0, 4, 10, 21));

-- Constante: contact_name canónico para todas las facturas Abuelo en manager_*.
-- Centralizado en una función para que cambios futuros (rebrand) sean un único
-- punto de cambio.
create or replace function public.abuelo_contact_name() returns text
language sql immutable as $$ select 'EL ABUELO (frutería propia)'::text $$;

-- Crear el contacto Abuelo en manager_contactos para que las facturas espejo
-- puedan referenciarlo (FK manager_facturas.contact_id → manager_contactos.id).
insert into public.manager_contactos (id, nombre, raw, updated_at)
values ('abuelo', public.abuelo_contact_name(), jsonb_build_object('source', 'abuelo'), now())
on conflict (id) do update set nombre = excluded.nombre;


-- ---------------------------------------------------------------------------
-- 2) Recalcular 2 facturas existentes (subtotal/total/importe correctos)
-- ---------------------------------------------------------------------------
-- Antes: total = sum(units*price), subtotal = total/1.04 (al revés del modelo).
-- Ahora: subtotal = sum(units*price), total = subtotal * (1 + tax/100).
-- Como las 2 existentes son frutas con tax=4 (default ya establecido arriba),
-- recomputamos directamente.
update public.manager_ventas_abuelo f
set subtotal = sub.subtotal_real,
    total    = sub.total_real,
    importe  = sub.total_real
from (
  select factura_id,
         sum(units * price)::numeric                                    as subtotal_real,
         sum(units * price * (1 + tax_rate / 100.0))::numeric           as total_real
  from public.manager_lineas_abuelo
  group by factura_id
) sub
where sub.factura_id = f.id;


-- ---------------------------------------------------------------------------
-- 3) RPC: crear factura atómicamente (Abuelo + espejo en manager_*)
-- ---------------------------------------------------------------------------
create or replace function public.manager_abuelo_factura_create(
  p_fecha          date,
  p_numero_factura text,
  p_nota           text,
  p_lineas         jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     public.app_role;
  v_factura  uuid;
  v_subtotal numeric;
  v_total    numeric;
  v_contact  text := public.abuelo_contact_name();
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'p_lineas debe ser un array jsonb';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin_full', 'admin_op') then
    raise exception 'sólo admin_full o admin_op pueden crear facturas Abuelo' using errcode = '42501';
  end if;

  -- Cabeceras: subtotal sin IVA, total con IVA por línea (tax 4/10/21).
  select coalesce(sum((l->>'units')::numeric * (l->>'price')::numeric), 0),
         coalesce(sum((l->>'units')::numeric * (l->>'price')::numeric
                      * (1 + coalesce((l->>'tax_rate')::numeric, 4) / 100.0)), 0)
    into v_subtotal, v_total
  from jsonb_array_elements(p_lineas) l;

  v_subtotal := round(v_subtotal::numeric, 2);
  v_total    := round(v_total::numeric, 2);

  -- ── Cabecera Abuelo ──
  insert into public.manager_ventas_abuelo
    (fecha, numero_factura, nota, importe, subtotal, total, created_by)
  values
    (p_fecha, nullif(p_numero_factura, ''), nullif(p_nota, ''),
     v_total, v_subtotal, v_total, auth.uid())
  returning id into v_factura;

  -- ── Líneas Abuelo ──
  insert into public.manager_lineas_abuelo (factura_id, product_id, nombre, units, price, tax_rate)
  select v_factura,
         nullif(l->>'product_id', ''),
         l->>'nombre',
         (l->>'units')::numeric,
         (l->>'price')::numeric,
         coalesce((l->>'tax_rate')::numeric, 4)
  from jsonb_array_elements(p_lineas) l;

  -- ── Espejo en manager_facturas (las 28 RPCs lo recogerán) ──
  insert into public.manager_facturas
    (id, tipo, subtipo, doc_number, contact_id, contact_name,
     fecha, fecha_vencimiento, descripcion,
     subtotal, impuestos, descuento, total, status,
     payments_total, payments_pending, payments_refunds,
     currency, tags, raw, updated_at)
  values
    (v_factura::text, 'VENTA', 'abuelo', nullif(p_numero_factura, ''),
     'abuelo', v_contact,
     p_fecha, p_fecha, nullif(p_nota, ''),
     v_subtotal, v_total - v_subtotal, 0, v_total, 1,
     v_total, 0, 0,
     'EUR', null, jsonb_build_object('source', 'abuelo'), now());

  -- ── Líneas espejo en manager_lineas ──
  -- id necesita ser único dentro de (factura_id, id). Usamos índice de array.
  insert into public.manager_lineas
    (id, factura_id, tipo, subtipo, fecha, contact_id, nombre, nombre_raw,
     descripcion, sku, product_id, variant_id, cuenta,
     units, price, cost_price, tax_rate, discount, raw)
  select 'L' || (idx - 1)::text,
         v_factura::text,
         'VENTA',
         'abuelo',
         p_fecha,
         'abuelo',
         l->>'nombre',
         l->>'nombre',
         null, null, nullif(l->>'product_id', ''), null, null,
         (l->>'units')::numeric,
         (l->>'price')::numeric,
         null,
         coalesce((l->>'tax_rate')::numeric, 4),
         0,
         l
  from jsonb_array_elements(p_lineas) with ordinality as t(l, idx);

  return v_factura;
end;
$$;

revoke all on function public.manager_abuelo_factura_create(date, text, text, jsonb) from public;
grant execute on function public.manager_abuelo_factura_create(date, text, text, jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- 4) Trigger: borrar Abuelo limpia el espejo
-- ---------------------------------------------------------------------------
create or replace function public.manager_abuelo_borrar_espejo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Lineas cascadean por FK desde manager_facturas.
  delete from public.manager_facturas where id = old.id::text and subtipo = 'abuelo';
  return old;
end;
$$;

drop trigger if exists trg_abuelo_borrar_espejo on public.manager_ventas_abuelo;
create trigger trg_abuelo_borrar_espejo
  after delete on public.manager_ventas_abuelo
  for each row execute function public.manager_abuelo_borrar_espejo();


-- ---------------------------------------------------------------------------
-- 5) Backfill: espejar las facturas Abuelo existentes
-- ---------------------------------------------------------------------------
do $$
declare
  v_contact text := public.abuelo_contact_name();
begin
  insert into public.manager_facturas
    (id, tipo, subtipo, doc_number, contact_id, contact_name,
     fecha, fecha_vencimiento, descripcion,
     subtotal, impuestos, descuento, total, status,
     payments_total, payments_pending, payments_refunds,
     currency, tags, raw, updated_at)
  select f.id::text, 'VENTA', 'abuelo', f.numero_factura,
         'abuelo', v_contact,
         f.fecha, f.fecha, f.nota,
         f.subtotal, f.total - f.subtotal, 0, f.total, 1,
         f.total, 0, 0,
         'EUR', null, jsonb_build_object('source', 'abuelo', 'backfill', true), now()
  from public.manager_ventas_abuelo f
  where not exists (
    select 1 from public.manager_facturas mf where mf.id = f.id::text and mf.subtipo = 'abuelo'
  );

  insert into public.manager_lineas
    (id, factura_id, tipo, subtipo, fecha, contact_id, nombre, nombre_raw,
     descripcion, sku, product_id, variant_id, cuenta,
     units, price, cost_price, tax_rate, discount, raw)
  select 'L' || (row_number() over (partition by l.factura_id order by l.created_at) - 1)::text,
         l.factura_id::text,
         'VENTA',
         'abuelo',
         f.fecha,
         'abuelo',
         l.nombre,
         l.nombre,
         null, null, l.product_id, null, null,
         l.units,
         l.price,
         null,
         l.tax_rate,
         0,
         jsonb_build_object('backfill', true)
  from public.manager_lineas_abuelo l
  join public.manager_ventas_abuelo f on f.id = l.factura_id
  where not exists (
    select 1 from public.manager_lineas ml where ml.factura_id = l.factura_id::text
  );
end $$;


-- ---------------------------------------------------------------------------
-- 6) Vista pública del listado Abuelo: añadir subtotal para mostrarlo en UI.
-- ---------------------------------------------------------------------------
drop view if exists public.manager_abuelo_facturas;
create view public.manager_abuelo_facturas as
select id,
       fecha,
       numero_factura,
       nota,
       coalesce(subtotal, 0)    as subtotal,
       coalesce(total, importe) as total,
       (select count(*) from manager_lineas_abuelo l where l.factura_id = f.id) as num_lineas,
       created_by,
       created_at
from manager_ventas_abuelo f;


-- ---------------------------------------------------------------------------
-- 7) Catálogo: añadir tax_rate_ultimo (último IVA visto por producto en Holded)
-- ---------------------------------------------------------------------------
drop function if exists public.manager_catalogo_productos(text, integer);
create or replace function public.manager_catalogo_productos(
  p_q     text default null,
  p_limit integer default 30
)
returns table (
  product_id        text,
  nombre            text,
  ultimo_precio     numeric,
  veces_vendido     bigint,
  tax_rate_ultimo   numeric
)
language sql
stable
as $$
  select
    product_id,
    nombre,
    (array_agg(price     order by fecha desc) filter (where price     is not null))[1]::numeric(12,4) as ultimo_precio,
    count(*)                                                                                          as veces_vendido,
    (array_agg(tax_rate  order by fecha desc) filter (where tax_rate  is not null))[1]::numeric       as tax_rate_ultimo
  from public.manager_lineas
  where tipo = 'VENTA'
    and product_id is not null
    and nombre is not null
    and (p_q is null or p_q = '' or nombre ilike '%' || p_q || '%')
  group by product_id, nombre
  order by veces_vendido desc
  limit p_limit;
$$;
