-- Higo seco: coste confirmado por Luis de 4,99 EUR por unidad/paquete.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('higo seco', 4.99, 'Coste por unidad/paquete confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
