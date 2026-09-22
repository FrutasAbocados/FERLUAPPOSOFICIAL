-- T1b · El lote no puede depender de la version del cliente.
--
-- Medido el 22-09: las 11 facturas subidas desde T1 traen `lote` en la
-- extraccion OCR, pero las 7 del dia 21 (102 lineas) se guardaron sin el. El
-- unico codigo que mapea lineas (filasCompra) si lo incluye, asi que se
-- subieron desde una PWA cacheada anterior a T1, que no enviaba el campo.
--
-- La base de datos deja de fiarse del cliente: si la linea llega sin lote u
-- origen, los toma de la extraccion OCR de la propia compra (misma `orden`).
-- No inventa nada: es lo que imprimio el proveedor. Un valor escrito a mano en
-- el formulario siempre gana, porque solo se rellena lo que llega nulo.

create or replace function public.pedidos_wa_compras_lineas_traza_desde_ocr()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lote   text;
  v_origen text;
begin
  if new.lote is not null and new.origen is not null then
    return new;
  end if;

  select nullif(btrim(e->>'lote'), ''), nullif(btrim(e->>'origen'), '')
  into v_lote, v_origen
  from public.pedidos_wa_compras c
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(c.raw_extraction->'lineas') = 'array'
         then c.raw_extraction->'lineas' else '[]'::jsonb end
  ) e
  where c.id = new.compra_id
    and (e->>'orden') ~ '^[0-9]+$'
    and (e->>'orden')::integer = new.orden
  limit 1;

  new.lote   := coalesce(new.lote, v_lote);
  new.origen := coalesce(new.origen, v_origen);
  return new;
end;
$fn$;

create or replace trigger pedidos_wa_compras_lineas_00_traza_desde_ocr
  before insert on public.pedidos_wa_compras_lineas
  for each row execute function public.pedidos_wa_compras_lineas_traza_desde_ocr();

-- Recuperacion de las lineas ya guardadas sin lote u origen, con la misma regla.
update public.pedidos_wa_compras_lineas cl
set lote   = coalesce(cl.lote, x.lote),
    origen = coalesce(cl.origen, x.origen)
from (
  select cl2.id,
         nullif(btrim(e->>'lote'), '')   as lote,
         nullif(btrim(e->>'origen'), '') as origen
  from public.pedidos_wa_compras_lineas cl2
  join public.pedidos_wa_compras c on c.id = cl2.compra_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(c.raw_extraction->'lineas') = 'array'
         then c.raw_extraction->'lineas' else '[]'::jsonb end
  ) e
  where (cl2.lote is null or cl2.origen is null)
    and (e->>'orden') ~ '^[0-9]+$'
    and (e->>'orden')::integer = cl2.orden
) x
where x.id = cl.id
  and ((cl.lote is null and x.lote is not null)
    or (cl.origen is null and x.origen is not null));
