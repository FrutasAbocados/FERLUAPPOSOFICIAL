-- Judia Plana: coste confirmado por Luis de 6,99 EUR/kg.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('judia plana', 6.99, 'Coste por kg confirmado por Luis 23-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
