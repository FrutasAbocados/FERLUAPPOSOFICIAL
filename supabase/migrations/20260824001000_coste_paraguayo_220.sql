-- Paraguayo: coste confirmado por Luis de 2,20 EUR/kg.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('paraguayo', 2.20, 'Coste por kg confirmado por Luis 24-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
