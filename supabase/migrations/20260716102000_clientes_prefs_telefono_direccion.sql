-- Clientes › Preferencias operativas — campos teléfono y dirección.
--
-- Muchos clientes tienen el teléfono metido dentro de los tags (texto libre tipo
-- "Fernando (jefazo): 622533597 ... direccion: C/ Velazquez 3"). Se añaden dos
-- columnas y se copia el primer móvil español encontrado al campo teléfono,
-- SIN modificar los tags (siguen visibles). La dirección se rellena a mano.

alter table public.clientes_preferencias
  add column if not exists telefono  text,
  add column if not exists direccion text;

-- Backfill: primer nº español (empieza por 6/7/9, 9 dígitos) hallado en los tags.
update public.clientes_preferencias
   set telefono = substring(array_to_string(tags, ' ') from '([679][0-9]{8})')
 where telefono is null
   and tags is not null
   and array_to_string(tags, ' ') ~ '[679][0-9]{8}';
