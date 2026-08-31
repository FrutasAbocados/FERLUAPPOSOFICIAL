-- Errata inequívoca: "Icebeg" es LECHUGA ICEBERG PIEZA.
-- Se enlaza al producto Holded para heredar el coste vivo de compras.
insert into public.pedidos_wa_productos_holded
  (producto_normalizado, holded_product_id, holded_product_name, source)
values
  ('icebeg', '66910b18dee208858d00ceeb', 'LECHUGA ICEBERG PIEZA', 'manual')
on conflict (producto_normalizado) do update
set holded_product_id = excluded.holded_product_id,
    holded_product_name = excluded.holded_product_name,
    source = excluded.source,
    updated_at = now();
