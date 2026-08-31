-- Patata Nueva Clasificada 300: coste confirmado por Luis de 1,25 EUR/kg.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('patata nueva clasificada 300', 1.25, 'Coste por kg confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
