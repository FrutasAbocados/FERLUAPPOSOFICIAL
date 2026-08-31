-- Variante plural de Brote de Soja: mismo coste de 2,50 EUR por bolsa.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('brotes soja', 2.50, 'Variante plural; confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
