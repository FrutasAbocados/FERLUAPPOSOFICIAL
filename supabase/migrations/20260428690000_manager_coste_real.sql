-- ============================================================================
-- Manager — fix coste de producto: usar precio real de compra
-- ============================================================================
-- BUG: manager_producto_coste usaba el campo `cost_price` de las líneas, que en
-- Holded es el "coste estándar de catálogo" del producto (típicamente fijo).
-- El precio REAL pagado al proveedor está en `price` de líneas tipo COMPRA.
--
-- Ejemplo TOMATE DANIELA KG:
--   cost_price (cataloto Holded): 2,99€ siempre.
--   price real abr-2026: 0,85 a 2,40€/kg → media ponderada ≈ 1,44€/kg.
-- Margen real pasaba de 12% (con coste fals 2,99) a 57% (con coste real 1,44).
--
-- Para evitar ruido de descuentos puntuales, usamos `subtotal / units` que es
-- el coste unitario neto realmente pagado (incluye descuentos al producto).
-- ============================================================================

drop view if exists public.manager_lineas_efectivas;
drop view if exists public.manager_producto_coste;

create view public.manager_producto_coste
with (security_invoker = on)
as
with ult4 as (
  select product_id, fecha, units, subtotal,
    (subtotal / nullif(units, 0))::numeric(12,4) as coste_unit,
    row_number() over (partition by product_id order by fecha desc) as rn
  from public.manager_lineas
  where tipo = 'COMPRA'
    and product_id is not null
    and units > 0
    and subtotal is not null
    and subtotal > 0
),
calc as (
  select product_id,
    case when count(*) = 1 then max(coste_unit)
         else sum(subtotal) / nullif(sum(units), 0)  -- media ponderada por unidades
    end as coste_calc,
    max(fecha) as ultima_compra,
    count(*) as compras_consideradas
  from ult4
  where rn <= 4
  group by product_id
)
select
  coalesce(m.product_id, c.product_id)               as product_id,
  coalesce(m.coste_eur, c.coste_calc)::numeric(12,4) as coste_eur,
  (m.product_id is not null)                         as es_manual,
  c.coste_calc::numeric(12,4)                        as coste_calculado,
  c.ultima_compra,
  coalesce(c.compras_consideradas, 0)                as compras_consideradas
from calc c
full outer join public.manager_costes_manuales m using (product_id);


-- Recreamos la vista que dependía de manager_producto_coste.
create view public.manager_lineas_efectivas
with (security_invoker = on)
as
select
  l.id,
  l.factura_id,
  l.tipo,
  l.subtipo,
  l.fecha,
  l.contact_id,
  l.product_id,
  l.nombre,
  l.descripcion,
  l.sku,
  l.units,
  l.price,
  l.discount,
  l.tax_rate,
  l.subtotal,
  (coalesce(l.subtotal, 0) * (1 + coalesce(l.tax_rate, 0) / 100))::numeric(14,4)               as total_linea,
  pc.coste_eur                                                                                  as coste_unidad,
  (coalesce(l.units, 0) * coalesce(pc.coste_eur, 0))::numeric(14,4)                            as cogs_linea,
  (coalesce(l.subtotal, 0) - coalesce(l.units, 0) * coalesce(pc.coste_eur, 0))::numeric(14,4)  as margen_linea,
  coalesce(a.alias_to, e.contact_name)                                                          as contact_name_canon,
  e.contact_name                                                                                as contact_name_raw
from public.manager_lineas l
join public.manager_ventas_efectivas e on e.id = l.factura_id
left join public.manager_producto_coste pc on pc.product_id = l.product_id
left join public.manager_clientes_alias a  on a.alias_from = e.contact_name;
