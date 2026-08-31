-- Cebolleta Holandesa: coste confirmado por Luis de 1,75 EUR por unidad/manojo.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('cebolleta holandesa', 1.75, 'Coste por unidad/manojo confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
