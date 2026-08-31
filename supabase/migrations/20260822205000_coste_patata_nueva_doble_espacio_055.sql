-- Variante con espacio duplicado de Patata Nueva KG.
-- Mismo coste de Patata Nueva Velez confirmado por Luis: 0,55 EUR/kg.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('patata nueva  kg', 0.55, 'Variante con espacio duplicado; confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
