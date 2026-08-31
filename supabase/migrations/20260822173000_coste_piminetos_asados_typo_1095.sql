-- Errata "Piminetos asados": misma bandeja que Pimientos asados.
-- Coste confirmado por Luis: 10,95 EUR por bandeja.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('piminetos asados', 10.95, 'Errata de pimientos asados; confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
