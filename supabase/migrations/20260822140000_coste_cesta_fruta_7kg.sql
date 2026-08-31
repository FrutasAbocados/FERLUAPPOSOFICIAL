-- Cesta de fruta de 7 kg: margen confirmado por Luis del 45%.
-- Precio observado: 15 EUR/cesta; coste equivalente: 15 * (1 - 0,45) = 8,25 EUR.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('cesta 7 kg fruta', 8.25, 'Margen 45% confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
