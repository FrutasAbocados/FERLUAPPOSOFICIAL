-- Malla de nora: coste confirmado por Luis de 18 EUR por malla.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('malla ñora', 18.00, 'Coste por malla confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
