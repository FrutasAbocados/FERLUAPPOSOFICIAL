-- TOMATE CHERRY TRICOLOR KG se factura realmente por bote.
-- Coste confirmado por Luis: 1,65 EUR por bote/unidad de linea.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('tomate cherry tricolor kg', 1.65, 'Coste por bote confirmado por Luis 22-ago; el nombre Holded dice KG')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
