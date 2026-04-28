-- ============================================================================
-- Manager — vistas analíticas
-- ============================================================================
-- 1) manager_ventas_efectivas: regla auto albarán.
--    Si en un mes el cliente tiene >=1 waybill, sus invoice de ese mes son la
--    factura agregada → se ignoran. Resto de subtipos (waybill/salesreceipt/
--    creditnote) se mantienen.
--
-- 2) manager_producto_coste: regla "último coste o media ponderada de las 4
--    últimas compras", con override manual desde manager_costes_manuales.
--
-- 3) manager_contacto_canon: aplica aliases de clientes a manager_contactos.
--
-- security_invoker=on en todas: la RLS de las tablas base (admin_full) sigue
-- aplicando, sin necesidad de policies separadas en las vistas.
-- ============================================================================

-- 1) ventas efectivas
drop view if exists public.manager_ventas_efectivas;
create view public.manager_ventas_efectivas
with (security_invoker = on)
as
with meses_con_albaran as (
  select contact_id, date_trunc('month', fecha)::date as mes
  from public.manager_facturas
  where tipo = 'VENTA' and subtipo = 'waybill' and contact_id is not null
  group by 1, 2
)
select f.*
from public.manager_facturas f
where f.tipo = 'VENTA'
  and not (
    f.subtipo = 'invoice'
    and f.contact_id is not null
    and exists (
      select 1
      from meses_con_albaran m
      where m.contact_id = f.contact_id
        and m.mes = date_trunc('month', f.fecha)::date
    )
  );

-- 2) coste por producto
drop view if exists public.manager_producto_coste;
create view public.manager_producto_coste
with (security_invoker = on)
as
with ult4 as (
  select product_id, fecha, units, cost_price,
    row_number() over (partition by product_id order by fecha desc) as rn
  from public.manager_lineas
  where tipo = 'COMPRA'
    and product_id is not null
    and units > 0
    and cost_price is not null
    and cost_price > 0
),
calc as (
  select product_id,
    case
      when count(*) = 1 then max(cost_price)
      else sum(cost_price * units) / nullif(sum(units), 0)
    end as coste_calc,
    max(fecha) as ultima_compra,
    count(*) as compras_consideradas
  from ult4
  where rn <= 4
  group by product_id
)
select coalesce(m.product_id, c.product_id)               as product_id,
       coalesce(m.coste_eur,  c.coste_calc)::numeric(12,4) as coste_eur,
       (m.product_id is not null)                          as es_manual,
       c.coste_calc::numeric(12,4)                         as coste_calculado,
       c.ultima_compra,
       coalesce(c.compras_consideradas, 0)                 as compras_consideradas
from calc c
full outer join public.manager_costes_manuales m using (product_id);

-- 3) contactos con nombre canónico (alias)
drop view if exists public.manager_contacto_canon;
create view public.manager_contacto_canon
with (security_invoker = on)
as
select c.id,
       coalesce(a.alias_to, c.nombre) as nombre_canon,
       c.nombre                       as nombre_raw,
       c.nif,
       c.cp,
       c.poblacion,
       c.pais
from public.manager_contactos c
left join public.manager_clientes_alias a on a.alias_from = c.nombre;
