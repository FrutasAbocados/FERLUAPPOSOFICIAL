-- Errata "Mezlcum Mimaflor": coste confirmado por Luis de 2,35 EUR por bolsa.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('mezlcum mimaflor', 2.35, 'Coste por bolsa confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
