-- Setas Cultivo: mismo formato que Bandeja Setas Cultivo.
-- Coste confirmado por Luis: 1,50 EUR por bandeja.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('setas cultivo', 1.50, 'Mismo coste que bandeja setas cultivo; Luis 23-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
