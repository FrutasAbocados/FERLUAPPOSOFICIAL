-- ============================================================================
-- Manager — Abuelo: facturas completas con múltiples líneas
-- ============================================================================
-- Hasta ahora manager_ventas_abuelo era una tabla plana (fecha + importe).
-- Cambiamos a estructura factura cabecera + líneas para registrar las ventas
-- de la frutería propia con detalle (catálogo de productos, unidades, precios).
--
-- Mantenemos manager_ventas_abuelo como cabecera (renombrando importe → total
-- por consistencia, pero conservamos compat). Nueva tabla manager_lineas_abuelo.
-- ============================================================================

-- Cabecera: ampliar
alter table public.manager_ventas_abuelo
  add column if not exists numero_factura text,
  add column if not exists subtotal       numeric(12,2),
  add column if not exists total          numeric(12,2);

-- Si total no está, llenar con importe (legado)
update public.manager_ventas_abuelo set total = importe where total is null;

-- Líneas
create table if not exists public.manager_lineas_abuelo (
  id          uuid primary key default gen_random_uuid(),
  factura_id  uuid not null references public.manager_ventas_abuelo(id) on delete cascade,
  product_id  text,                     -- id Holded si lo elige del catálogo
  nombre      text not null,            -- nombre del producto (puede ser libre)
  units       numeric(14,4) not null default 1,
  price       numeric(12,4) not null default 0,
  subtotal    numeric(12,2) generated always as (round((units * price)::numeric, 2)) stored,
  created_at  timestamptz not null default now()
);

create index if not exists manager_lineas_abuelo_factura_idx on public.manager_lineas_abuelo (factura_id);
create index if not exists manager_lineas_abuelo_product_idx on public.manager_lineas_abuelo (product_id);

-- RLS admin_full
alter table public.manager_lineas_abuelo enable row level security;
drop policy if exists "manager: admin_full lineas abuelo" on public.manager_lineas_abuelo;
create policy "manager: admin_full lineas abuelo"
  on public.manager_lineas_abuelo for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full'));


-- ---------------------------------------------------------------------------
-- Vista para listar abuelo con resumen
-- ---------------------------------------------------------------------------
drop view if exists public.manager_abuelo_facturas;
create view public.manager_abuelo_facturas
with (security_invoker = on)
as
select
  f.id, f.fecha, f.numero_factura, f.nota,
  coalesce(f.total, f.importe) as total,
  (select count(*) from public.manager_lineas_abuelo l where l.factura_id = f.id) as num_lineas,
  f.created_by, f.created_at
from public.manager_ventas_abuelo f;


-- ---------------------------------------------------------------------------
-- Catálogo de productos para autocomplete (lo que se ha vendido alguna vez)
-- ---------------------------------------------------------------------------
create or replace function public.manager_catalogo_productos(p_q text default null, p_limit int default 30)
returns table(
  product_id text,
  nombre     text,
  ultimo_precio numeric,
  veces_vendido bigint
) language sql security invoker stable as $$
  select
    product_id,
    nombre,
    (array_agg(price order by fecha desc))[1]::numeric(12,4) as ultimo_precio,
    count(*)                                                  as veces_vendido
  from public.manager_lineas
  where tipo = 'VENTA'
    and product_id is not null
    and nombre is not null
    and (p_q is null or p_q = '' or nombre ilike '%' || p_q || '%')
  group by product_id, nombre
  order by veces_vendido desc
  limit p_limit;
$$;
