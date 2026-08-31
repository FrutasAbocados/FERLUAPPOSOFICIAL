-- Bote de oliva sin hueso: coste confirmado por Luis de 14 EUR por bote.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('bote oliva sin hueso', 14.00, 'Coste por bote confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
