-- Pedidos WA: presentaciones comerciales y redondeo de la lista de compra.

create table if not exists public.pedidos_wa_formatos_compra (
  producto_key text not null,
  unidad_base text not null,
  unidad_compra text not null,
  contenido numeric not null check (contenido > 0),
  updated_at timestamptz not null default now(),
  primary key (producto_key, unidad_base)
);

drop trigger if exists pedidos_wa_formatos_compra_touch on public.pedidos_wa_formatos_compra;
create trigger pedidos_wa_formatos_compra_touch before update on public.pedidos_wa_formatos_compra
for each row execute function public.touch_updated_at();

alter table public.pedidos_wa_formatos_compra enable row level security;

create policy "pedidos_wa_formatos_compra: admin rw" on public.pedidos_wa_formatos_compra
for all using (is_admin()) with check (is_admin());
create policy "pedidos_wa_formatos_compra: operaciones read" on public.pedidos_wa_formatos_compra
for select using (puede_operar_pedidos_wa() or es_responsable());

grant select, insert, update, delete on public.pedidos_wa_formatos_compra to authenticated;

drop function if exists public.pedidos_wa_compra_operativa(date);
create function public.pedidos_wa_compra_operativa(p_fecha date)
returns table (
  producto text,
  producto_key text,
  unidad text,
  pedido_total numeric,
  inventario numeric,
  a_comprar numeric,
  sobra numeric,
  kg_por_caja numeric,
  pedido_cajas numeric,
  inventario_cajas numeric,
  a_comprar_cajas numeric,
  proveedor text,
  proveedor_fuente text,
  unidad_compra text,
  contenido_compra numeric,
  cantidad_compra numeric
)
language sql
security invoker
stable
set search_path = public
as $$
with cotejo as (
  select * from public.pedidos_wa_cotejo(p_fecha)
),
keys as (
  select
    c.*,
    lower(c.producto) as producto_key,
    ph.holded_product_id
  from cotejo c
  left join lateral (
    select ph.holded_product_id
    from public.pedidos_wa_productos_holded ph
    where ph.holded_product_name = c.producto
    order by case when ph.source = 'manual' then 0 else 1 end, ph.updated_at desc
    limit 1
  ) ph on true
),
historico as (
  select distinct on (k.producto_key)
    k.producto_key,
    case
      when lower(mf.contact_name) like '%abasthosur%' then 'abasthosur'
      when lower(mf.contact_name) like '%alcalde%' then 'alcalde'
      else 'mercado'
    end as proveedor
  from keys k
  join public.manager_lineas ml
    on (k.holded_product_id is not null and ml.product_id = k.holded_product_id)
    or lower(ml.nombre) = lower(k.producto)
  join public.manager_facturas mf on mf.id = ml.factura_id and mf.tipo = 'COMPRA'
  order by k.producto_key, mf.fecha desc nulls last, mf.updated_at desc
)
select
  k.producto,
  k.producto_key,
  k.unidad,
  k.pedido_total,
  k.inventario,
  k.a_comprar,
  k.sobra,
  k.kg_por_caja,
  k.pedido_cajas,
  k.inventario_cajas,
  k.a_comprar_cajas,
  coalesce(pp.proveedor, h.proveedor, 'alcalde') as proveedor,
  case when pp.proveedor is not null then 'manual'
       when h.proveedor is not null then 'historico'
       else 'default' end as proveedor_fuente,
  coalesce(fc.unidad_compra, k.unidad) as unidad_compra,
  coalesce(fc.contenido, 1) as contenido_compra,
  case when fc.contenido is not null
       then ceil(k.a_comprar / fc.contenido)
       else k.a_comprar end as cantidad_compra
from keys k
left join public.pedidos_wa_producto_proveedor pp on pp.producto_key = k.producto_key
left join historico h on h.producto_key = k.producto_key
left join public.pedidos_wa_formatos_compra fc
  on fc.producto_key = k.producto_key and fc.unidad_base = k.unidad
order by coalesce(pp.proveedor, h.proveedor, 'alcalde'), k.a_comprar desc, k.producto;
$$;

grant execute on function public.pedidos_wa_compra_operativa(date) to authenticated;
