-- La confirmacion nueva de 1,25 EUR aplica al producto HUEVOS M DOCENA.
-- Los formatos XL conservan el coste de 3,25 EUR confirmado el 17-jul.

-- Corrige los dos alias XL creados durante la auditoria: no deben apuntar al
-- producto M porque son formatos distintos.
delete from public.pedidos_wa_productos_holded
where producto_normalizado in ('docena huevo xl', 'docena huevos xl')
  and holded_product_id = '69820f73babf54480409b7b9'
  and source = 'manual';

insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values
  ('huevos m docena', 1.25, 'Coste fijo HUEVOS M — Luis 22-ago'),
  ('docena huevo xl', 3.25, 'Huevos XL docena — Luis 17-jul'),
  ('docena huevos xl', 3.25, 'Huevos XL docena — Luis 17-jul')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
