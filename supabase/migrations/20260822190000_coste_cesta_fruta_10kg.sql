-- Cesta de fruta de 10 kg: margen del 45% confirmado por Luis.
-- Precio observado: 20 EUR/cesta; coste equivalente: 20 * 0,55 = 11 EUR.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('cesta fruta 10 kg', 11.00, 'Margen 45% confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
