-- Fix nivel 1 del resolver: busca histórico cliente por product_id (via mapeo
-- pedidos_wa_productos_holded) en lugar de por nombre de texto. El match por
-- nombre casi nunca funciona porque manager_lineas.nombre viene de Holded
-- ("NARANJA ZUMO KG") y producto_normalizado viene del parser WA ("naranjas").

drop function if exists public.pedidos_wa_resolver_completo(uuid);

create or replace function public.pedidos_wa_resolver_completo(p_pedido_id uuid)
returns table (
  linea_id              uuid,
  orden                 int,
  producto_normalizado  text,
  cantidad              numeric,
  unidad                text,
  es_gratis             boolean,
  iva_pct               numeric,
  precio_resuelto       numeric,
  precio_fuente         text,
  precio_fecha          date,
  total_estimado        numeric,
  holded_product_id     text,
  holded_product_name   text,
  trazabilidad          text
)
language sql stable
as $$
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
  -- Nivel 1: último precio que este cliente pagó por este producto (por product_id)
  historico_cliente as (
    select distinct on (ph.producto_normalizado)
      ph.producto_normalizado as prod_key,
      ml.price,
      ml.tax_rate,
      ml.fecha
    from public.pedidos_wa_productos_holded ph
    join public.manager_lineas ml on ml.product_id = ph.holded_product_id
    cross join cliente
    where ml.contact_id = cliente.holded_contact_id
      and ml.tipo       = 'VENTA'
      and ml.price is not null
      and ml.price > 0
    order by ph.producto_normalizado, ml.fecha desc
  ),
  -- Nivel 2: precio medio últimos 60d para ese producto (todos los clientes)
  tarifa_base as (
    select
      ph.producto_normalizado as prod_key,
      avg(ml.price)::numeric(12,2) as price,
      max(ml.fecha)            as fecha,
      max(ml.tax_rate)         as tax_rate
    from public.pedidos_wa_productos_holded ph
    join public.manager_lineas ml on ml.product_id = ph.holded_product_id
    where ml.tipo = 'VENTA'
      and ml.price is not null
      and ml.price > 0
      and ml.fecha >= current_date - 60
    group by ph.producto_normalizado
  ),
  -- Nivel 3: última venta del producto a cualquier cliente, sin límite de fecha
  ultima_venta_global as (
    select distinct on (ph.producto_normalizado)
      ph.producto_normalizado as prod_key,
      ml.price                as price,
      ml.fecha                as fecha,
      ml.tax_rate             as tax_rate
    from public.pedidos_wa_productos_holded ph
    join public.manager_lineas ml on ml.product_id = ph.holded_product_id
    where ml.tipo = 'VENTA'
      and ml.price is not null
      and ml.price > 0
    order by ph.producto_normalizado, ml.fecha desc
  ),
  trazas_holded as (
    select distinct on (ml.product_id)
      ml.product_id      as holded_product_id,
      mf.fecha           as fecha_compra,
      mf.contact_name    as proveedor_nombre,
      mf.doc_number      as num_factura
    from public.manager_lineas   ml
    join public.manager_facturas mf on mf.id = ml.factura_id
    cross join cliente cli
    where ml.tipo = 'COMPRA'
      and ml.product_id is not null
      and mf.fecha is not null
      and mf.fecha <= cli.fecha_pedido
    order by ml.product_id, mf.fecha desc
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
    order by l.prod_lower, cmp.fecha desc
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
$$;

grant execute on function public.pedidos_wa_resolver_completo(uuid) to authenticated;
