-- Zumo Naranja 5 L: Holded desglosa la linea como 5 unidades/litros.
-- Coste confirmado por Luis: 2,95 EUR por litro/unidad de linea.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('zumo naranja 5 l', 2.95, 'Coste por litro; linea desglosada en 5 unidades. Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
