-- Esparragos medios: coste confirmado por Luis de 2,95 EUR/manojo.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('espárragos medios manojo', 2.95, 'Coste por manojo confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
