-- PIMIENTO PADRÓN KG: el manual de 3,20 EUR/kg (27-jun) queda para el periodo
-- cerrado. Desde septiembre usa las compras reales de PIMIENTO PADRON GRANEL KG
-- (5,99 EUR/kg a 15-sep). Confirmado por Luis 15-sep.
update public.manager_costes_manuales_nombre
set fecha_hasta = date '2026-08-31',
    nota = coalesce(nota, '') || ' · cerrado 31-ago, desde sept compras granel (Luis 15-sep)',
    updated_at = now()
where nombre_norm = 'pimiento padrón kg'
  and fecha_hasta is null;

insert into public.manager_coste_nombre_auto (nombre_norm, holded_product_id, nota)
values ('pimiento padrón kg', '698374c7137cb4438b05a8ab', 'Variante de PIMIENTO PADRON GRANEL KG')
on conflict (nombre_norm) do update
set holded_product_id = excluded.holded_product_id,
    nota = excluded.nota,
    updated_at = now();
