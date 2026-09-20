-- T1 · Captura de trazabilidad en la compra (paso atrás del Reglamento 178/2002).
--
-- El lote del proveedor ya llegaba, pero sin sitio propio: el parser mete el
-- campo "Trazab/Lote" de Alcalde dentro de `codigo_proveedor`, y proveedores
-- como Gallego Costa escriben ahí origen y lote juntos. Sin un campo propio no
-- hay nada que propagar a la venta.
--
-- `codigo_proveedor` NO se toca: `compra-a-holded` lo envía a Holded dentro de
-- la descripción de línea ("ref <codigo>"), y cambiarlo alteraría documentos ya
-- creados.

alter table public.pedidos_wa_compras_lineas
  add column if not exists lote text,
  add column if not exists origen text;

comment on column public.pedidos_wa_compras_lineas.lote is
  'Lote o partida del proveedor, copiado literal de la factura. Base de la trazabilidad hacia atrás.';
comment on column public.pedidos_wa_compras_lineas.origen is
  'Origen que imprime el proveedor, copiado literal (ej. "CUENCA (ESPAÑA)", "España"). Sin normalizar.';

-- Búsqueda por lote: es la consulta de una retirada ("¿dónde fue este lote?").
create index if not exists idx_pedidos_wa_compras_lineas_lote
  on public.pedidos_wa_compras_lineas (lote)
  where lote is not null;

-- Rescate del lote histórico de Alcalde. En sus facturas la columna
-- "Trazab/Lote" es lo único que hay en `codigo_proveedor` (formatos
-- "1272.53.340" y "EUR/17-08"), nunca un código de artículo. Se copia, no se
-- interpreta; si mañana se corrige a mano, esto no vuelve a pisarlo.
update public.pedidos_wa_compras_lineas cl
set lote = cl.codigo_proveedor
from public.pedidos_wa_compras c
where c.id = cl.compra_id
  and c.proveedor_nombre ilike '%ALCALDE%'
  and cl.codigo_proveedor is not null
  and cl.codigo_proveedor <> ''
  and cl.lote is null;
