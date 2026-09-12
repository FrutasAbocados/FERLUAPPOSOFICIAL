-- Manager: saneo de costes detectado en la revision de margen 01-10 sep 2026.
-- Cada override obsoleto deja de mandar desde el 01-09; los periodos
-- anteriores conservan el coste que ya mostraban.

-- Patata Agria El Torcal es la compra principal (0,66-0,75 EUR/kg) y estaba
-- fuera del historial por un alias inactivo.
update public.manager_compra_alias
set activo = true,
    nota = 'Reactivado 11-sep: compra principal de patata agria'
where nombre_compra_norm = 'patata agria 15kg el torcal';

-- La caja "Aprox.4kg" pesa ~5,1 kg: 3,25 EUR/kg confirmado por Luis a
-- 16,5 EUR/caja y 191 cajas conciliadas con 996 kg vendidos. Sigue inactivo.
update public.manager_compra_alias
set factor_unidad = 5.1,
    nota = 'Caja real ~5,1 kg (conciliacion 11-sep); manda coste Luis 3,25'
where nombre_compra_norm = 'aguacates aprox.4kg';

-- El brocoli se compra en unidades de ~2,2 piezas (ratio venta/compra estable
-- jun-ago) y se vende por pieza.
update public.manager_compra_alias
set factor_unidad = 2.2,
    nota = 'Compra ~2,2 piezas por unidad; venta por pieza (11-sep)'
where nombre_compra_norm = 'brocoli';

-- product_id '0' es un centinela: estas compras no llegaban a ningun coste.
update public.manager_compra_alias as a
set holded_product_id = v.pid,
    nota = v.nota
from (values
  ('zanahorias 5kg bolsa', '669110c70e602aa17d0e0db7', 'ZANAHORIA BOLSA (11-sep)'),
  ('aguacate sigfrido/retamosa*alv.14/16/18* +-4 kg (*c)', '66911745882f9189080927fb', 'AGUACATE EXTRA TROPS KG (11-sep)'),
  ('zumo de naranja', 'virtual_zumo_naranja_l', 'Zumo naranja L (11-sep)'),
  ('pitaya roja', 'virtual_pitaya', 'Pitaya sin producto Holded (11-sep)'),
  ('pimientos asados tiras', 'virtual_pimiento_asado', 'Pimiento asado sin producto Holded (11-sep)'),
  ('champiñon portobello', 'virtual_portobello', 'Portobello sin producto Holded (11-sep)'),
  ('fruta de la pasion', 'virtual_fruta_pasion', 'Fruta de la pasion sin producto Holded (11-sep)')
) as v(nombre, pid, nota)
where a.nombre_compra_norm = v.nombre
  and a.holded_product_id = '0';

insert into public.manager_compra_alias
  (nombre_compra_norm, holded_product_id, factor_unidad, activo, nota)
values
  ('tomate rosa extra', '66911212daa37d590205a55b', 1, true, 'TOMATE ROSA KG (11-sep)'),
  ('alfalfa', '67cf0e1dc5ba9de0020a8166', 1, true, 'BROTES DE ALFALFA (11-sep)'),
  ('cogollos cortos lucas', '69bb9e28207d01af7703ba1b', 1, true, '@COGOLLOS CORTOS (11-sep)')
on conflict (nombre_compra_norm) do nothing;

-- Nombres de venta sin product_id enlazados a su producto (solo Manager).
insert into public.manager_coste_nombre_auto (nombre_norm, holded_product_id, nota)
values
  ('tomate pera kg', '6691115c4c2f8c9f780f3ebe', 'Variante de TOMATE PERA EXTRA KG'),
  ('tomate rosa kg', '66911212daa37d590205a55b', 'TOMATE ROSA KG sin product_id desde julio'),
  ('aguacate kg', '66911745882f9189080927fb', 'Variante de AGUACATE EXTRA TROPS KG'),
  ('piña avion', '66911837d32e20e435080bae', 'Variante de PIÑA AVIÓN KG'),
  ('patata melendez guarnicion kg', '696cfb9f0332d6ecee0ab6e0', 'Variante de patatas guarnicion melendez'),
  ('judia plana kg', '67cefee9550dfb95c804452e', 'JUDIA VERDE PLANA'),
  ('judia plana  kg', '67cefee9550dfb95c804452e', 'JUDIA VERDE PLANA'),
  ('pitaya', 'virtual_pitaya', 'Compras PITAYA ROJA'),
  ('pitayas', 'virtual_pitaya', 'Compras PITAYA ROJA'),
  ('pitaya roja', 'virtual_pitaya', 'Compras PITAYA ROJA'),
  ('pitaya roja kg', 'virtual_pitaya', 'Compras PITAYA ROJA'),
  ('pitaya morada', 'virtual_pitaya', 'Compras PITAYA ROJA'),
  ('pitaya morada kg', 'virtual_pitaya', 'Compras PITAYA ROJA')
on conflict (nombre_norm) do nothing;

-- Overrides por nombre por debajo del coste de compra actual.
update public.manager_costes_manuales_nombre
set fecha_hasta = date '2026-08-31'
where fecha_hasta is null
  and nombre_norm in (
    'tomate cherry imperial kg',
    'lechuga ensalada mezclum 500gr',
    'coliflor',
    'tomate huevo de toro kg',
    'tomate rosa kg',
    'tomate pera kg',
    'brocoli',
    'pitaya',
    'pitayas',
    'pitaya roja',
    'pitaya roja kg',
    'pitaya morada',
    'pitaya morada kg'
  );

-- Judia plana: 6,99 EUR/kg confirmado por Luis el 23-ago sustituye a 2,95.
update public.manager_costes_manuales_nombre
set fecha_hasta = date '2026-08-22'
where fecha_hasta is null
  and nombre_norm in ('judia plana kg', 'judia plana  kg');

insert into public.manager_costes_manuales (product_id, fecha_desde, coste_eur, nota, updated_at)
values ('67cefee9550dfb95c804452e', date '2026-08-23', 6.99, 'Judia plana: coste confirmado por Luis 23-ago', now())
on conflict (product_id, fecha_desde) do nothing;

-- Overrides de producto muy por encima de las compras actuales.
update public.manager_costes_manuales
set fecha_hasta = date '2026-08-31'
where fecha_hasta is null
  and (product_id, fecha_desde) in (
    ('685d184279fa75147a086959', date '2026-06-03'),
    ('6691189896bde2717f0b5c5c', date '2026-05-27')
  );

-- Variantes de nombre pendientes con coste ya confirmado.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values
  ('cesta 6,5 kg fruta', 7.70, 'Variante de cesta fruta 6,5 kg; margen 45% confirmado por Luis 22-ago'),
  ('fruta pasión', 6.99, 'Variante con tilde de fruta pasion; Luis 30-jul')
on conflict (nombre_norm) do nothing;
