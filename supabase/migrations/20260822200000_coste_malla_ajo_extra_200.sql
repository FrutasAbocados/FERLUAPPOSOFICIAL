-- Malla de ajo extra: 2 mallas equivalen aproximadamente a 1 kg.
-- Coste confirmado por Luis: 4 EUR/kg => 2 EUR por malla/unidad de linea.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('malla ajo extra', 2.00, '2 mallas = 1 kg; coste 4 EUR/kg. Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
