-- Maiz Fresco: coste confirmado por Luis de 1,50 EUR por unidad/mazorca.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('maiz fresco', 1.50, 'Coste por unidad/mazorca confirmado por Luis 24-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
