-- Originales 32/71, 37/71, 45/71 y 46/71 contrastados: K.Netos es peso,
-- aunque ENV sea *U o *M. No se modifican cantidades, importes ni trazas.
update public.pedidos_wa_compras_lineas l
set unidad = 'kg',
    notas = concat_ws(' · ', nullif(l.notas, ''), 'Unidad kg verificada en K.Netos del PDF original; ENV describe envase (22-sep-2026)')
from public.pedidos_wa_compras c
where c.id = l.compra_id
  and c.fecha between date '2026-09-21' and date '2026-09-22'
  and c.num_factura in ('32/71','37/71','45/71','46/71')
  and c.proveedor_nombre = 'FRUTAS PEREZ ALCALDE S.L.'
  and l.unidad in ('unidad','manojo')
  and l.cantidad <> trunc(l.cantidad)
  and l.descripcion in ('APIO BLANCO','APIO RABE','APIO VERDE','MELON PIEL DE SAPO',
    'PIÑA DEL MONTE','SANDIAS BLANCAS','CALABAZAS','CEBOLLAS FRESCAS','MANZANAS STARKING','COLES DURAS');
