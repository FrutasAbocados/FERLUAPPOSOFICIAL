-- Melon Bollo: coste confirmado por Luis de 1,75 EUR/kg.
-- Se cubren las dos variantes observadas con y sin tilde/sufijo KG.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
values
  ('melon bollo', 1.75, 'Coste por kg confirmado por Luis 22-ago'),
  ('melón bollo kg', 1.75, 'Coste por kg confirmado por Luis 22-ago')
on conflict (nombre_norm) do update
set coste_eur = excluded.coste_eur,
    nota = excluded.nota,
    updated_at = now();
