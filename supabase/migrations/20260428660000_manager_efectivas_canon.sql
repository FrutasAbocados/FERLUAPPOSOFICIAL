-- ============================================================================
-- Manager — vista manager_ventas_efectivas_canon
-- ============================================================================
-- Versión de manager_ventas_efectivas con el nombre canónico ya resuelto vía
-- manager_clientes_alias. Útil para los KPIs / Top contactos del frontend, que
-- agrupa por contact_name_canon. Si no hay alias, contact_name_canon = contact_name.
-- ============================================================================

drop view if exists public.manager_ventas_efectivas_canon;
create view public.manager_ventas_efectivas_canon
with (security_invoker = on)
as
select e.*,
       coalesce(a.alias_to, e.contact_name) as contact_name_canon
from public.manager_ventas_efectivas e
left join public.manager_clientes_alias a on a.alias_from = e.contact_name;

-- También una vista equivalente para compras, por consistencia.
drop view if exists public.manager_compras_canon;
create view public.manager_compras_canon
with (security_invoker = on)
as
select f.*,
       coalesce(a.alias_to, f.contact_name) as contact_name_canon
from public.manager_facturas f
left join public.manager_clientes_alias a on a.alias_from = f.contact_name
where f.tipo = 'COMPRA';
