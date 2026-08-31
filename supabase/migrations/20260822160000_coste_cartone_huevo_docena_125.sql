-- "Cartone huevo" representa docenas de huevos M.
-- Coste confirmado por Luis: 1,25 EUR por docena/unidad de linea.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('cartone huevo', 1.25, 'Unidad = docena de huevos M; confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
