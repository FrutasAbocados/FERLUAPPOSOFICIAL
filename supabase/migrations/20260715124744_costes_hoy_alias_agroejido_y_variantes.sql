-- Reconecta compras y variantes de venta detectadas sin coste el 2026-07-15.
-- Los costes siguen siendo calculados desde líneas COMPRA; no se fijan importes manuales.

insert into public.manager_compra_alias
  (nombre_compra_norm, holded_product_id, factor_unidad, coste_fijo, nota, activo)
values
  ('pimiento morron rojo 1º', '6691101e8b5cb98b2304509c', 1, null, 'Agroejido -> PIMIENTO ROJO ASAR KG', true),
  ('germinado albahaca verde', '69d75294f71d6c3c760112d1', 1, null, 'Micro albahaca verde -> GERMINADO ALBAHACA', true)
on conflict (nombre_compra_norm) do update
set holded_product_id = excluded.holded_product_id,
    factor_unidad = excluded.factor_unidad,
    coste_fijo = excluded.coste_fijo,
    nota = excluded.nota,
    activo = excluded.activo,
    updated_at = now();

insert into public.pedidos_wa_productos_holded
  (producto_normalizado, holded_product_id, holded_product_name, source, updated_at)
values
  ('apios', '696e0861826f96d3960bf5f9', 'APIO BLANCO BOLSA', 'manual', now()),
  ('chalotas', '698373e04c5f7e98f7062039', 'CHALOTA KG', 'manual', now()),
  ('micro albahaca', '69d75294f71d6c3c760112d1', 'GERMINADO ALBAHACA', 'manual', now()),
  ('micro albahaca verde', '69d75294f71d6c3c760112d1', 'GERMINADO ALBAHACA', 'manual', now()),
  ('microalbahaca', '69d75294f71d6c3c760112d1', 'GERMINADO ALBAHACA', 'manual', now()),
  ('microalbahaca verde', '69d75294f71d6c3c760112d1', 'GERMINADO ALBAHACA', 'manual', now()),
  ('naranja kg', '6691150b38fe57f167061768', 'NARANJA ZUMO  KG', 'manual', now())
on conflict (producto_normalizado) do update
set holded_product_id = excluded.holded_product_id,
    holded_product_name = excluded.holded_product_name,
    source = excluded.source,
    updated_at = excluded.updated_at;

select public.manager_refresh_coste_alias();
