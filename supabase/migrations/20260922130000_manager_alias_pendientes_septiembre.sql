-- Cierra los costes pendientes de septiembre con compras reales fechadas.
-- No se fija ningun precio nuevo: cada nombre de venta se enlaza con el
-- producto Holded cuyas compras ya existen, o con un coste ya confirmado.

-- Pera: las compras de Alcalde/GM Cash no llegaban al producto y el coste
-- se quedaba en abril. Todas son pera conferencia por kg.
insert into public.manager_compra_alias
  (nombre_compra_norm, holded_product_id, factor_unidad, activo, nota)
values
  ('peras conferencia 1 lecho', '696e3170d36262d32101ddbe', 1, true, 'Pera conferencia por kg; compras 9 y 11-sep; 22-sep'),
  ('peras conferencia granel',  '696e3170d36262d32101ddbe', 1, true, 'Pera conferencia granel por kg; compra 16-sep; 22-sep'),
  ('pera conference nac.e/k',   '696e3170d36262d32101ddbe', 1, true, 'Pera conference GM Cash por kg; 22-sep')
on conflict (nombre_compra_norm) do nothing;

-- Nombres de venta sin product_id que corresponden a un producto con compras.
insert into public.manager_coste_nombre_auto (nombre_norm, holded_product_id, nota)
values
  ('patata clasificada 300 kg', '685d16ed146233fecf02aa75', 'PATATA N3 CLASIFICADA: compras PATATAS CLASIFICADAS Nº3; variante de patata 300; 22-sep'),
  ('patata agria kg',           '6699021ae9c12971080dfb79', 'PATATA AGRIA TORCAL KG: compras PATATA AGRIA 15KG EL TORCAL; 22-sep'),
  ('pera',                      '696e3170d36262d32101ddbe', 'PERA CONFERENCIA KG por kg, como el alias peras; 22-sep'),
  ('brote albahaca',            '69d75294f71d6c3c760112d1', 'GERMINADO ALBAHACA, como micro albahaca; 22-sep'),
  ('pepino kg',                 '66910b9b30fbcfff8702b61e', 'PEPINO TERRENO KG, como el alias pepino; 22-sep'),
  ('manzana golden kg',         '6691179d5659c704f80b38dc', 'MANZANA GOLDEN MARLENE C15 KG, como manzana golden; 22-sep'),
  ('docenas huevos',            '69820f73babf54480409b7b9', 'HUEVOS M DOCENA, como docena huevos; conserva el coste fijo de Luis; 22-sep')
on conflict (nombre_norm) do nothing;

-- Variante plural inequivoca de un coste ya confirmado; conserva caducidad.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota, fecha_hasta)
select 'calabazas violin', m.coste_eur,
       'Variante plural de calabaza violin; ' || coalesce(m.nota, ''), m.fecha_hasta
from public.manager_costes_manuales_nombre m
where m.nombre_norm = 'calabaza violin'
on conflict (nombre_norm) do nothing;

select public.manager_refresh_coste_historico();
select public.manager_refresh_costes_calc();
select public.manager_refresh_coste_alias_internal();
select public.manager_refresh_producto_compra_resumen();
