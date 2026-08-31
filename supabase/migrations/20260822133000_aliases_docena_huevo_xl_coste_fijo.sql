-- Luis confirma un coste fijo de 1,25 EUR por docena de huevos.
-- Estas variantes inequívocas deben reutilizar el producto manual ya fijado.
insert into public.pedidos_wa_productos_holded
  (producto_normalizado, holded_product_id, holded_product_name, source)
values
  ('docena huevo xl',  '69820f73babf54480409b7b9', 'HUEVOS M DOCENA', 'manual'),
  ('docena huevos xl', '69820f73babf54480409b7b9', 'HUEVOS M DOCENA', 'manual')
on conflict (producto_normalizado) do update
set holded_product_id = excluded.holded_product_id,
    holded_product_name = excluded.holded_product_name,
    source = excluded.source,
    updated_at = now();
