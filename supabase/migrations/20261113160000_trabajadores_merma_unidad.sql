-- Merma en formatos además de kg: manojo, bolsa, caja o unidad. peso_kg pasa a ser la cantidad.
alter table public.trabajadores_merma
  add column if not exists unidad text not null default 'kg'
  check (unidad in ('kg', 'unidad', 'manojo', 'bolsa', 'caja'));
comment on column public.trabajadores_merma.peso_kg is 'Cantidad en la unidad de la fila (kg salvo manojo, bolsa, caja o unidad).';
