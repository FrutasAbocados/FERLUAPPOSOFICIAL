-- Categorías extra solicitadas por Luis 2026-05-06: Nóminas, SS, Asesoría, IRPF, Bancos, Tlf, Marketing, Formación
insert into public.gastos_categorias (nombre, color, orden) values
  ('Nóminas',             '#0ea5e9', 100),
  ('Seguros Sociales',    '#7c3aed', 110),
  ('Asesoría/Gestoría',   '#0891b2', 120),
  ('IRPF / Hacienda',     '#b91c1c', 130),
  ('Bancos / Comisiones', '#475569', 140),
  ('Telefonía / Internet','#0d9488', 150),
  ('Marketing',           '#db2777', 160),
  ('Formación',           '#65a30d', 170)
on conflict (nombre) do nothing;
