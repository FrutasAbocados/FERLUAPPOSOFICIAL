-- Brote de soja: la unidad de venta es una bolsa.
-- Coste confirmado por Luis: 2,50 EUR por bolsa.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('brote soja', 2.50, 'Coste por bolsa confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
