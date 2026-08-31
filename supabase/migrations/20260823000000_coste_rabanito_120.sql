-- Rabanito: coste confirmado por Luis de 1,20 EUR por manojo/unidad.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('rabanito', 1.20, 'Coste por manojo confirmado por Luis 23-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
