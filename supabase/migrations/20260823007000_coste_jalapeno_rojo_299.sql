-- Jalapeno Rojo: coste confirmado por Luis de 2,99 EUR por unidad/bandeja.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('jalapeño rojo', 2.99, 'Coste por unidad/bandeja confirmado por Luis 23-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
