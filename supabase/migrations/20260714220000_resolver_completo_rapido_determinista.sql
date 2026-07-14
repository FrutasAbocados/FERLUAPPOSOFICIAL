-- INCIDENTE 14-jul-2026: se confirmaron 14 pedidos de golpe y solo 4 llegaron a
-- Holded. Los otros 10 murieron con 57014 (query_canceled = statement timeout).
--
-- Causa: pedidos_wa_resolver_completo tardaba ~1,24 s y leía ~90.000 bloques para
-- resolver 9 líneas. Los CTE de precios (histórico cliente, tarifa base 60d,
-- última venta global) y de trazabilidad se calculaban sobre TODO el catálogo de
-- productos y luego se tiraba el 99% en los LEFT JOIN finales. Con 1-2 pedidos
-- sueltos se aguantaba; con 14 concurrentes, la contención los mata.
--
-- Este cambio hace dos cosas:
--
-- 1) ACOTAR: el CTE `prods` limita el trabajo a los productos que lleva el pedido.
--    Los CTE de precios cuelgan de él en vez de recorrer manager_lineas entera.
--
-- 2) DESEMPATAR: los `distinct on (...) order by ... fecha desc` no desempataban
--    cuando un producto tenía VARIAS ventas el mismo día → el precio que se
--    facturaba dependía del plan que eligiera Postgres, es decir, era una lotería.
--    Ahora gana siempre el documento más reciente (updated_at, doc_number), con
--    factura_id/id como desempate final: el resultado es 100% reproducible.
--
-- Ojo: (2) cambia algunos precios respecto a lo que salía antes, porque antes NO
-- había regla. No es una regresión: es fijar un comportamiento que no existía.
create or replace function public.pedidos_wa_resolver_completo(p_pedido_id uuid)
returns table(
  linea_id uuid,
  orden integer,
  producto_normalizado text,
  cantidad numeric,
  unidad text,
  es_gratis boolean,
  iva_pct numeric,
  precio_resuelto numeric,
  precio_fuente text,
  precio_fecha date,
  total_estimado numeric,
  holded_product_id text,
  holded_product_name text,
  trazabilidad text
)
language sql
stable
set search_path to 'public'
as $function$
  with cliente as (
    select c.holded_contact_id, p.fecha as fecha_pedido
    from public.pedidos_wa p
    join public.pedidos_wa_clientes c on c.id = p.cliente_id
    where p.id = p_pedido_id
  ),
  lineas as (
    select
      l.id, l.orden, l.cantidad, l.unidad, l.es_gratis,
      l.producto_normalizado,
      lower(l.producto_normalizado) as prod_lower
    from public.pedidos_wa_lineas l
    where l.pedido_id = p_pedido_id
  ),
  -- Solo los productos de ESTE pedido. Es el filtro que faltaba.
  prods as (
    select distinct
      ph.producto_normalizado,
      lower(ph.producto_normalizado) as prod_lower,
      ph.holded_product_id
    from public.pedidos_wa_productos_holded ph
    join lineas l on lower(ph.producto_normalizado) = l.prod_lower
  ),
  -- Nivel 1: último precio que este cliente pagó por este producto
  historico_cliente as (
    select distinct on (pr.producto_normalizado)
      pr.producto_normalizado as prod_key,
      ml.price,
      ml.tax_rate,
      ml.fecha
    from prods pr
    join public.manager_lineas ml on ml.product_id = pr.holded_product_id
    join public.manager_facturas mf on mf.id = ml.factura_id
    cross join cliente
    where ml.contact_id = cliente.holded_contact_id
      and ml.tipo       = 'VENTA'
      and ml.price is not null
      and ml.price > 0
    order by pr.producto_normalizado, ml.fecha desc, mf.updated_at desc nulls last,
             mf.doc_number desc nulls last, ml.factura_id desc, ml.id desc
  ),
  -- Nivel 2: precio medio últimos 60d para ese producto (todos los clientes)
  tarifa_base as (
    select
      pr.producto_normalizado as prod_key,
      avg(ml.price)::numeric(12,2) as price,
      max(ml.fecha)            as fecha,
      max(ml.tax_rate)         as tax_rate
    from prods pr
    join public.manager_lineas ml on ml.product_id = pr.holded_product_id
    where ml.tipo = 'VENTA'
      and ml.price is not null
      and ml.price > 0
      and ml.fecha >= current_date - 60
    group by pr.producto_normalizado
  ),
  -- Nivel 3: última venta del producto a cualquier cliente, sin límite de fecha
  ultima_venta_global as (
    select distinct on (pr.producto_normalizado)
      pr.producto_normalizado as prod_key,
      ml.price                as price,
      ml.fecha                as fecha,
      ml.tax_rate             as tax_rate
    from prods pr
    join public.manager_lineas ml on ml.product_id = pr.holded_product_id
    join public.manager_facturas mf on mf.id = ml.factura_id
    where ml.tipo = 'VENTA'
      and ml.price is not null
      and ml.price > 0
    order by pr.producto_normalizado, ml.fecha desc, mf.updated_at desc nulls last,
             mf.doc_number desc nulls last, ml.factura_id desc, ml.id desc
  ),
  trazas_holded as (
    select distinct on (ml.product_id)
      ml.product_id      as holded_product_id,
      mf.fecha           as fecha_compra,
      mf.contact_name    as proveedor_nombre,
      mf.doc_number      as num_factura
    from prods pr
    join public.manager_lineas   ml on ml.product_id = pr.holded_product_id
    join public.manager_facturas mf on mf.id = ml.factura_id
    cross join cliente cli
    where ml.tipo = 'COMPRA'
      and ml.product_id is not null
      and mf.fecha is not null
      and mf.fecha <= cli.fecha_pedido
    order by ml.product_id, mf.fecha desc, mf.updated_at desc nulls last,
             mf.doc_number desc nulls last, ml.factura_id desc, ml.id desc
  ),
  trazas_compras_wa as (
    select distinct on (l.prod_lower)
      l.prod_lower,
      cmp.proveedor_nombre,
      cmp.fecha            as fecha_compra,
      cmp.num_factura      as num_factura
    from lineas l
    cross join cliente cli
    join public.pedidos_wa_compras_lineas cl
      on lower(cl.descripcion) like '%' || l.prod_lower || '%'
    join public.pedidos_wa_compras cmp on cmp.id = cl.compra_id
    where cmp.fecha <= cli.fecha_pedido
    order by l.prod_lower, cmp.fecha desc, cmp.num_factura desc nulls last, cmp.id desc
  )
  select
    l.id                                                 as linea_id,
    l.orden,
    l.producto_normalizado,
    l.cantidad,
    l.unidad,
    l.es_gratis,
    coalesce(hc.tax_rate, tb.tax_rate, uvg.tax_rate, 4)::numeric as iva_pct,
    case
      when l.es_gratis           then 0
      when hc.price is not null  then hc.price
      when tb.price is not null  then tb.price
      when uvg.price is not null then uvg.price
      else 0
    end                                                  as precio_resuelto,
    case
      when l.es_gratis              then 'gratis'
      when hc.price is not null     then 'historico_cliente'
      when tb.price is not null     then 'tarifa_base'
      when uvg.price is not null    then 'ultima_venta_global'
      else 'no_resuelto'
    end                                                  as precio_fuente,
    coalesce(hc.fecha, tb.fecha, uvg.fecha)              as precio_fecha,
    case
      when l.es_gratis           then 0
      when hc.price is not null  then l.cantidad * hc.price
      when tb.price is not null  then l.cantidad * tb.price
      when uvg.price is not null then l.cantidad * uvg.price
      else 0
    end::numeric                                         as total_estimado,
    ph.holded_product_id,
    ph.holded_product_name,
    case
      when tcw.proveedor_nombre is not null then
        'L' || to_char(tcw.fecha_compra, 'YYMMDD')
            || coalesce(' · ' || tcw.num_factura, '')
      when th.fecha_compra is not null then
        'L' || to_char(th.fecha_compra, 'YYMMDD')
            || coalesce(' · ' || th.num_factura, '')
      else null
    end                                                  as trazabilidad
  from lineas l
  left join public.pedidos_wa_productos_holded ph on ph.producto_normalizado = l.prod_lower
  left join historico_cliente hc  on lower(hc.prod_key) = l.prod_lower
  left join tarifa_base tb        on lower(tb.prod_key) = l.prod_lower
  left join ultima_venta_global uvg on lower(uvg.prod_key) = l.prod_lower
  left join trazas_holded th on th.holded_product_id = ph.holded_product_id
  left join trazas_compras_wa tcw on tcw.prod_lower = l.prod_lower
  order by l.orden;
$function$;
