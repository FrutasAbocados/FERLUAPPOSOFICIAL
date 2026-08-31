-- Variante sin tilde de Sandia Blanca Rayada: mismo coste confirmado de 0,55 EUR/kg.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('sandia blanca rayada kg', 0.55, 'Variante sin tilde; coste confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
