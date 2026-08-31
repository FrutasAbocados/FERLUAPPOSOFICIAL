-- Arandanos 125 gr: coste confirmado por Luis de 1,90 EUR por bandeja.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('arandanos 125 gr', 1.90, 'Coste por bandeja confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
