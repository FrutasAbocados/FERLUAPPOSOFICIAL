-- Costes confirmados por Luis el 12-sep sobre las ventas que quedaban sin
-- resolver en la revision de margen de septiembre.
--
-- Ristra de ñoras: 29 EUR/unidad, que es tambien el precio de compra real
-- (3 unidades a 29 EUR entre el 25-ago y el 10-sep). La malla de ñoras a
-- 18 EUR es otro formato y se queda como esta.
-- Tomate golden raff: 9 EUR/kg. Se vende a 14,95 EUR/kg.
-- Tomate raf iberico: variante sin guion del coste ya confirmado el 22-ago.

insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values
  ('rista de ñoras',       29.00, 'Coste por ristra confirmado por Luis 12-sep'),
  ('ristra de ñoras',      29.00, 'Coste por ristra confirmado por Luis 12-sep'),
  ('ristra ñora',          29.00, 'Coste por ristra confirmado por Luis 12-sep'),
  ('rista ñora',           29.00, 'Coste por ristra confirmado por Luis 12-sep'),
  ('tomate golden raff kg', 9.00, 'Coste por kg confirmado por Luis 12-sep'),
  ('tomate golden raff',    9.00, 'Coste por kg confirmado por Luis 12-sep'),
  ('tomate raf iberico kg', 5.90, 'Variante sin guion de tomate raf - iberico kg; Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now(),
    fecha_hasta = null;

-- Mango terreno: 2,25 EUR/kg confirmado por Luis. Eran 289 EUR de compra sin
-- mapear desde el 25-ago. Se engancha a MANGO EXTRA KG con coste fijo, igual
-- que el alias "mangos" pineado a 2,00.
insert into public.manager_compra_alias
  (nombre_compra_norm, holded_product_id, factor_unidad, coste_fijo, activo, nota)
values
  ('mango terreno', '66911802cf2a4714d5034360', 1, 2.25, true, 'pin 2,25/kg val Luis 12-sep')
on conflict (nombre_compra_norm) do update
set holded_product_id = excluded.holded_product_id,
    factor_unidad = excluded.factor_unidad,
    coste_fijo = excluded.coste_fijo,
    activo = true,
    nota = excluded.nota;
