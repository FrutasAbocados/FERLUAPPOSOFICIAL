-- "Italiano" se refiere a Pimiento Italiano.
-- Coste confirmado por Luis: 0,85 EUR/kg.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('italiano', 0.85, 'Pimiento italiano; coste por kg confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
