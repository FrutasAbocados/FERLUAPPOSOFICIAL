-- Guindillas Thai (nombre observado "thay"): coste confirmado por Luis de 1,95 EUR/unidad.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('guindillas thay', 1.95, 'Coste por unidad confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
