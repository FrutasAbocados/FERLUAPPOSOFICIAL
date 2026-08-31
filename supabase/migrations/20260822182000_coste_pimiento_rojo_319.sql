-- Pimiento Rojo: coste confirmado por Luis de 3,19 EUR/kg.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('pimiento rojo kg', 3.19, 'Coste por kg confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
