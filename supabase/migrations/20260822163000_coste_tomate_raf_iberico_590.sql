-- Tomate RAF-Iberico: coste confirmado por Luis de 5,90 EUR/kg.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('tomate raf - iberico kg', 5.90, 'Coste por kg confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
