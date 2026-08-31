-- Bandeja de Setas de Cultivo: coste confirmado por Luis de 1,50 EUR/bandeja.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('bandeja setas cultivo', 1.50, 'Coste por bandeja confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
