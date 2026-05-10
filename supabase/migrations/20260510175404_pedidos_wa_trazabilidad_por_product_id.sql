-- RPC pedidos_wa_resolver_completo: trazabilidad ahora se resuelve por
-- product_id Holded contra manager_lineas (sync oficial), con fallback al
-- LIKE existente sobre pedidos_wa_compras_lineas. La fuente principal es
-- manager_lineas porque ya está vinculada al holded_product_id de cada
-- producto normalizado vía pedidos_wa_productos_holded — el match es exacto,
-- no por texto, y por eso resuelve trazabilidad en TODAS las líneas que
-- tengan vínculo Holded (no solo las que casan por palabra).
--
-- Construye trazabilidad como: 'Lote DD/MM/YYYY · PROVEEDOR · DOC_NUMBER'.
-- Si para una misma product_id hay varias compras, usa la más reciente con
-- fecha ≤ fecha del pedido (FIFO inverso, no vendes lo que aún no compraste).
--
-- Resto del RPC (historico_cliente, tarifa_base, precio_resuelto, etc.) NO
-- se toca — solo cambian los CTE de trazabilidad y el case final.

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
  -- Precio histórico de ESTE cliente para el producto (por nombre).
  historico_cliente as (
    select distinct on (lower(ml.nombre))
      lower(ml.nombre) as prod_key,
      ml.price,
      ml.tax_rate,
      ml.fecha
    from public.manager_lineas ml, cliente
    where ml.contact_id = cliente.holded_contact_id
      and ml.tipo       = 'VENTA'
      and ml.price is not null
      and ml.price > 0
      and lower(ml.nombre) in (select prod_lower from lineas)
    order by lower(ml.nombre), ml.fecha desc
  ),
  -- Tarifa base: avg de price últimos 60 días para el product_id Holded
  -- (cualquier cliente). Solo aplica si la línea WA tiene mapeo a productId.
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
  -- TRAZABILIDAD prioridad 1: COMPRA Holded vinculada por product_id.
  -- Última compra con fecha ≤ pedido (FIFO inverso).
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
  -- TRAZABILIDAD prioridad 2: fallback LIKE sobre pedidos_wa_compras_lineas
  -- (parser facturas proveedor manual, cuando aún no llegó el sync Holded).
  trazas_compras_wa as (
    select distinct on (l.prod_lower)
      l.prod_lower,
      cl.descripcion       as desc_proveedor,
      cmp.proveedor_nombre as proveedor_nombre,
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
    coalesce(hc.tax_rate, tb.tax_rate, 4)::numeric       as iva_pct,
    case
      when l.es_gratis           then 0
      when hc.price is not null  then hc.price
      when tb.price is not null  then tb.price
      else 0
    end                                                  as precio_resuelto,
    case
      when l.es_gratis              then 'gratis'
      when hc.price is not null     then 'historico_cliente'
      when tb.price is not null     then 'tarifa_base'
      else 'no_resuelto'
    end                                                  as precio_fuente,
    coalesce(hc.fecha, tb.fecha)                         as precio_fecha,
    case
      when l.es_gratis           then 0
      when hc.price is not null  then l.cantidad * hc.price
      when tb.price is not null  then l.cantidad * tb.price
      else 0
    end::numeric                                         as total_estimado,
    ph.holded_product_id,
    ph.holded_product_name,
    case
      when th.proveedor_nombre is not null then
        'Lote ' || to_char(th.fecha_compra, 'DD/MM/YYYY')
                || ' · ' || th.proveedor_nombre
                || coalesce(' · ' || th.num_factura, '')
      when tcw.proveedor_nombre is not null then
        'Lote ' || to_char(tcw.fecha_compra, 'DD/MM/YYYY')
                || ' · ' || tcw.proveedor_nombre
                || coalesce(' · ' || tcw.num_factura, '')
      else null
    end                                                  as trazabilidad
  from lineas l
  left join historico_cliente hc on hc.prod_key = l.prod_lower
  left join public.pedidos_wa_productos_holded ph on ph.producto_normalizado = l.prod_lower
  left join tarifa_base tb on tb.prod_key = l.prod_lower
  left join trazas_holded th on th.holded_product_id = ph.holded_product_id
  left join trazas_compras_wa tcw on tcw.prod_lower = l.prod_lower
  order by l.orden;
$$;

grant execute on function public.pedidos_wa_resolver_completo(uuid) to authenticated;
