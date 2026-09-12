-- "Meclum" es una errata de mezclum en una venta de septiembre y quedaba sin
-- coste. Se enlaza al producto de mezclum para que siga a las compras reales,
-- en lugar de fijarle un importe.
insert into public.manager_coste_nombre_auto (nombre_norm, holded_product_id, nota)
values ('meclum', '66910b689a09c7a9880e35f9', 'Errata de mezclum; LECHUGA ENSALADA MEZCLUM 500GR')
on conflict (nombre_norm) do nothing;
