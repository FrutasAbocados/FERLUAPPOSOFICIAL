-- Cesta de fruta de 6,5 kg: mismo margen del 45% confirmado por Luis.
-- Precio observado: 14 EUR/cesta; coste equivalente: 14 * 0,55 = 7,70 EUR.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('cesta fruta 6,5 kg', 7.70, 'Margen 45% confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
