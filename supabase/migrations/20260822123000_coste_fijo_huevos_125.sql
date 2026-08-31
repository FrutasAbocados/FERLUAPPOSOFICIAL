-- Coste fijo de huevos confirmado por Luis el 22-ago-2026.
-- Se aplica al producto canónico HUEVOS M DOCENA y, por extensión, a todas las
-- variantes de nombre enlazadas al mismo producto en Manager/Pedidos WA.

insert into public.manager_costes_manuales
  (product_id, coste_eur, fecha_desde, nota)
values
  (
    '69820f73babf54480409b7b9',
    1.25,
    date '2026-02-01',
    'Coste fijo 1,25 EUR/docena confirmado por Luis 22/08/2026'
  )
on conflict (product_id, fecha_desde) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
