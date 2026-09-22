-- Equivalencias verificadas en compras y ventas. No se inventan precios:
-- el historial conserva la media ponderada de tres fechas por producto.
-- Melocoton lleva en la venta las referencias 3671/X6, 3861/X6, 3905/X6,
-- cuyas compras son MELOCOTON CALANDA 18 por kg.
insert into public.manager_compra_alias
  (nombre_compra_norm, holded_product_id, factor_unidad, activo, nota)
values
  ('melocoton calanda 18', 'virtual_melocoton_calanda', 1, true, 'Compra kg enlazada por referencia de factura de las ventas; 22-sep'),
  ('manzanas granny', 'virtual_manzana_granny', 1, true, 'Granny Smith por kg; 22-sep'),
  ('mazorca de maiz', 'virtual_maiz_fresco', 1, true, 'Compras y ventas 2/11-sep en el mismo formato y cantidad; 22-sep'),
  ('remolacha cocida', 'virtual_remolacha_cocida', 1, true, 'Paquete/unidad; compra y venta de 4 unidades el 4-sep; 22-sep'),
  ('ajetes', 'virtual_ajete_manojo', 1, true, '4 manojos comprados y vendidos el 11-sep; 22-sep'),
  ('lemongrass', 'virtual_lemongrass', 1, true, 'Manojo, compra y venta 21-sep; 22-sep'),
  ('rabanillas', 'virtual_rabanilla', 1, true, 'Manojo, compra y venta 19-sep; 22-sep'),
  ('nabo granel', 'virtual_nabo_kg', 1, true, 'Peso fraccionario en compras y ventas; 22-sep'),
  ('pepino mini', 'virtual_pepino_snack', 1, true, 'Compra y venta 16-sep de 1,12 kg; 22-sep')
on conflict (nombre_compra_norm) do nothing;

insert into public.manager_coste_nombre_auto (nombre_norm, holded_product_id, nota)
values
  ('calabacin kg', '66910488be9acdfcd40c4718', 'Variante sin tilde de CALABACÍN KG; 22-sep'),
  ('pepino holandeses', '69876eb23c611ac9be0040b5', 'Plural de PEPINO HOLANDES KG; 22-sep'),
  ('tomate cherry kg', '6691125c49f74268790e2094', 'Cherry por kg: compra TOMATE CHERRY RAMA, referencia 9/71 en venta; 22-sep'),
  ('melocoton', 'virtual_melocoton_calanda', 'Ref compra Calanda en ventas 3671/X6, 3861/X6 y 3905/X6; 22-sep'),
  ('melocotón', 'virtual_melocoton_calanda', 'Abono de melocoton; mismo producto y unidad; 22-sep'),
  ('manzana smith', 'virtual_manzana_granny', 'Granny Smith por kg; 22-sep'),
  ('maiz fresco', 'virtual_maiz_fresco', 'Mismo formato y cantidades compradas/vendidas 2 y 11-sep; 22-sep'),
  ('remolacha cocido', 'virtual_remolacha_cocida', 'Variante de remolacha cocida en paquetes; 22-sep'),
  ('manojo ajete', 'virtual_ajete_manojo', 'Compra AJETES 4 unidades, venta 4 manojos 11-sep; 22-sep'),
  ('lemon grass', 'virtual_lemongrass', 'Variante de LEMONGRASS por manojo; 22-sep'),
  ('rabanilla', 'virtual_rabanilla', 'Singular de RABANILLAS por manojo; 22-sep'),
  ('nabo', 'virtual_nabo_kg', 'Nabo granel por kg; 22-sep'),
  ('nabo grande', 'virtual_nabo_kg', 'Nabo granel por kg; 22-sep'),
  ('pepino snack', 'virtual_pepino_snack', 'Venta y compra 1,12 kg del 16-sep; 22-sep')
on conflict (nombre_norm) do nothing;

-- Solo variantes inequívocas de costes ya confirmados; conservar caducidad.
insert into public.manager_costes_manuales_nombre (nombre_norm,coste_eur,nota,fecha_hasta)
select v.destino,m.coste_eur,'Variante de '||v.origen||'; '||coalesce(m.nota,''),m.fecha_hasta
from (values ('litro zumo naranja','zumo naranja litro'),
             ('espinacas baby','espinaca baby'),
             ('higos secos','higo seco')) v(destino,origen)
join public.manager_costes_manuales_nombre m on m.nombre_norm=v.origen
on conflict (nombre_norm) do nothing;

select public.manager_refresh_costes_calc();
select public.manager_refresh_coste_alias_internal();
select public.manager_refresh_producto_compra_resumen();
