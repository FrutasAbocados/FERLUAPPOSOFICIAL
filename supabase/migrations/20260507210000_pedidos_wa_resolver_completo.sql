-- RPC ampliado: precio histórico + productId Holded + trazabilidad (último proveedor).
-- La edge `pedido-a-holded` usa este para enriquecer cada line item con
--   - productId  (reusa producto del catálogo en lugar de crear nuevo)
--   - desc       (trazabilidad: lote/proveedor último)

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
  historico as (
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
  -- Trazabilidad: última compra a proveedor de un producto similar antes/igual a la fecha del pedido.
  -- Match laxo: descripcion del proveedor contiene producto_normalizado (case-insensitive).
  trazas as (
    select distinct on (l.prod_lower)
      l.prod_lower,
      cl.descripcion as desc_proveedor,
      cmp.proveedor_nombre,
      cmp.fecha as fecha_compra,
      cmp.num_factura
    from lineas l, cliente cli
    join public.pedidos_wa_compras_lineas cl
      on lower(cl.descripcion) like '%' || (select prod_lower from lineas l2 where l2.id = l.id) || '%'
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
    coalesce(h.tax_rate, 4)::numeric                     as iva_pct,
    case when l.es_gratis then 0 else h.price end        as precio_resuelto,
    case
      when l.es_gratis        then 'gratis'
      when h.price is not null then 'historico_cliente'
      else 'no_resuelto'
    end                                                  as precio_fuente,
    h.fecha                                              as precio_fecha,
    coalesce(l.cantidad * (case when l.es_gratis then 0 else h.price end), 0)::numeric
                                                         as total_estimado,
    ph.holded_product_id,
    ph.holded_product_name,
    case
      when t.proveedor_nombre is null then null
      else 'Lote ' || to_char(t.fecha_compra, 'DD/MM/YYYY')
           || ' · ' || t.proveedor_nombre
           || coalesce(' · ' || t.num_factura, '')
    end                                                  as trazabilidad
  from lineas l
  left join historico h on h.prod_key = l.prod_lower
  left join public.pedidos_wa_productos_holded ph on ph.producto_normalizado = l.prod_lower
  left join trazas t on t.prod_lower = l.prod_lower
  order by l.orden;
$$;

grant execute on function public.pedidos_wa_resolver_completo(uuid) to authenticated;
