-- Variante con espacio duplicado de Tomate Cherry KG.
-- Coste confirmado por Luis: 2,20 EUR/kg.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('tomate cherry  kg', 2.20, 'Coste por kg confirmado por Luis 23-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
