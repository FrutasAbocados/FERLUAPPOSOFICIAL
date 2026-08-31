-- Mini Flores Pensamiento: coste confirmado por Luis de 2,50 EUR por unidad.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('mini flores pensamiento', 2.50, 'Coste por unidad confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
