-- Paquete de Guindilla: coste confirmado por Luis de 1,75 EUR por paquete.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values ('paquete guindilla', 1.75, 'Coste por paquete confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
