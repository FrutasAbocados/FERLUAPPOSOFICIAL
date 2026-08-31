-- Tomate Tricolor: mismo formato por bote que Tomate Cherry Tricolor.
-- Coste confirmado por Luis: 1,65 EUR por bote/unidad de linea.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('tomate tricolor', 1.65, 'Mismo bote que tomate cherry tricolor; confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
