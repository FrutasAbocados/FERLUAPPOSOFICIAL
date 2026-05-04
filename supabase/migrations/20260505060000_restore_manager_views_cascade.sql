-- ============================================================================
-- HOTFIX 2026-05-05 · Restaurar vistas Manager destruidas por CASCADE
-- ============================================================================
-- INCIDENTE: en 20260505030000 se hizo `drop table manager_costes_manuales
-- cascade`. El CASCADE se llevó por delante:
--   - public.manager_producto_coste (FULL OUTER JOIN con costes_manuales)
--   - public.manager_lineas_efectivas (depende de manager_producto_coste)
--
-- Consecuencia: el módulo Manager rompía en producción — KPIs de Resumen
-- todos en "..." porque manager_resumen_comparativo usa manager_lineas_efectivas.
--
-- Aquí se recrean ambas vistas tal cual estaban en 20260428690000_manager_coste_real.sql.
-- ============================================================================

create or replace view public.manager_producto_coste
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
         else sum(subtotal) / nullif(sum(units), 0)
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


create or replace view public.manager_lineas_efectivas
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
