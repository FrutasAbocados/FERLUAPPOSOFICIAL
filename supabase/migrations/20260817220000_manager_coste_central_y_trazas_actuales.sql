-- Cerrar los dos consumidores que todavia dependian de compras con product_id
-- crudo. Las compras Holded actuales llegan sin product_id y se resuelven por
-- manager_compra_alias, por lo que la vista central y la trazabilidad deben usar
-- las fuentes resueltas igual que las fichas de Manager.

create or replace view public.manager_producto_coste
with (security_invoker = on)
as
with ult4_directas as (
  select
    l.product_id,
    l.fecha,
    l.units,
    l.subtotal,
    (l.subtotal / nullif(l.units, 0))::numeric(12,4) as coste_unit,
    row_number() over (
      partition by l.product_id
      order by l.fecha desc, l.factura_id desc, l.id desc
    ) as rn
  from public.manager_lineas l
  where l.tipo = 'COMPRA'
    and l.product_id is not null
    and l.units > 0
    and l.subtotal > 0
),
legacy_directo as (
  select
    product_id,
    case
      when count(*) = 1 then max(coste_unit)
      else sum(subtotal) / nullif(sum(units), 0)
    end as coste_calc,
    max(fecha) as ultima_compra,
    count(*) as compras_consideradas
  from ult4_directas
  where rn <= 4
  group by product_id
),
latest_manual as (
  select distinct on (m.product_id)
    m.product_id,
    m.coste_eur
  from public.manager_costes_manuales m
  order by m.product_id, m.fecha_desde desc
),
productos as (
  select product_id from latest_manual
  union
  select product_id from public.manager_coste_alias_calc
  union
  select product_id from public.manager_coste_producto_calc
  union
  select product_id from public.manager_producto_compra_resumen
  union
  select product_id from legacy_directo
)
select
  p.product_id,
  coalesce(m.coste_eur, a.coste_eur, c.coste_eur, d.coste_calc)::numeric(12,4)
    as coste_eur,
  (m.product_id is not null) as es_manual,
  coalesce(a.coste_eur, c.coste_eur, d.coste_calc)::numeric(12,4)
    as coste_calculado,
  coalesce(r.ultima_compra, a.ultima_compra, d.ultima_compra) as ultima_compra,
  coalesce(a.n_compras::bigint, d.compras_consideradas, 0::bigint)
    as compras_consideradas
from productos p
left join latest_manual m using (product_id)
left join public.manager_coste_alias_calc a using (product_id)
left join public.manager_coste_producto_calc c using (product_id)
left join public.manager_producto_compra_resumen r using (product_id)
left join legacy_directo d using (product_id);

alter view public.manager_producto_coste owner to postgres;
revoke all on public.manager_producto_coste from anon;
grant select on public.manager_producto_coste to authenticated, service_role;

-- La traza LYYMMDD de Pedidos WA tambien miraba solo compras con product_id.
-- Se conserva el contrato del RPC, pero se toma la ultima compra resuelta
-- (incluidos alias historicos inactivos) hasta la fecha del pedido.
-- SECURITY DEFINER permite que los roles operativos, que no ven Manager, usen
-- esa resolucion. El CTE autorizado mantiene el mismo limite funcional del modulo.
create or replace function public.pedidos_wa_resolver_completo(p_pedido_id uuid)
returns table (
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
security definer
set search_path to 'public'
as $function$
  with autorizado as (
    select public.puede_operar_pedidos_wa() as ok
  ),
  cliente as (
    select c.holded_contact_id, p.fecha as fecha_pedido
    from public.pedidos_wa p
    join public.pedidos_wa_clientes c on c.id = p.cliente_id
    cross join autorizado a
    where p.id = p_pedido_id
      and a.ok
  ),
  lineas as (
    select
      l.id, l.orden, l.cantidad, l.unidad, l.es_gratis,
      l.producto_normalizado,
      lower(l.producto_normalizado) as prod_lower
    from public.pedidos_wa_lineas l
    cross join autorizado a
    where l.pedido_id = p_pedido_id
      and a.ok
  ),
  prods as (
    select distinct
      ph.producto_normalizado,
      lower(ph.producto_normalizado) as prod_lower,
      ph.holded_product_id
    from public.pedidos_wa_productos_holded ph
    join lineas l on lower(ph.producto_normalizado) = l.prod_lower
  ),
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
      and ml.tipo = 'VENTA'
      and ml.price is not null
      and ml.price > 0
    order by pr.producto_normalizado, ml.fecha desc, mf.updated_at desc nulls last,
             mf.doc_number desc nulls last, ml.factura_id desc, ml.id desc
  ),
  tarifa_base as (
    select
      pr.producto_normalizado as prod_key,
      avg(ml.price)::numeric(12,2) as price,
      max(ml.fecha) as fecha,
      max(ml.tax_rate) as tax_rate
    from prods pr
    join public.manager_lineas ml on ml.product_id = pr.holded_product_id
    where ml.tipo = 'VENTA'
      and ml.price is not null
      and ml.price > 0
      and ml.fecha >= current_date - 60
    group by pr.producto_normalizado
  ),
  ultima_venta_global as (
    select distinct on (pr.producto_normalizado)
      pr.producto_normalizado as prod_key,
      ml.price,
      ml.fecha,
      ml.tax_rate
    from prods pr
    join public.manager_lineas ml on ml.product_id = pr.holded_product_id
    join public.manager_facturas mf on mf.id = ml.factura_id
    where ml.tipo = 'VENTA'
      and ml.price is not null
      and ml.price > 0
    order by pr.producto_normalizado, ml.fecha desc, mf.updated_at desc nulls last,
             mf.doc_number desc nulls last, ml.factura_id desc, ml.id desc
  ),
  precios_minimos as (
    select
      m.holded_product_id,
      ceil((c.coste_eur / (1 - m.margen_pct / 100)) * 100) / 100 as precio_minimo
    from public.pedidos_wa_margen_minimo m
    join public.manager_producto_coste c
      on c.product_id = m.holded_product_id
     and c.coste_eur > 0
    where m.activo
  ),
  trazas_holded as (
    select distinct on (r.product_id_historial)
      r.product_id_historial as holded_product_id,
      mf.fecha as fecha_compra,
      mf.contact_name as proveedor_nombre,
      mf.doc_number as num_factura
    from prods pr
    join public.manager_lineas_producto_resueltas r
      on r.product_id_historial = pr.holded_product_id
    join public.manager_facturas mf on mf.id = r.factura_id
    cross join cliente cli
    where r.tipo = 'COMPRA'
      and mf.fecha is not null
      and mf.fecha <= cli.fecha_pedido
    order by r.product_id_historial, mf.fecha desc,
             mf.updated_at desc nulls last, mf.doc_number desc nulls last,
             r.factura_id desc, r.id desc
  ),
  trazas_compras_wa as (
    select distinct on (l.prod_lower)
      l.prod_lower,
      cmp.proveedor_nombre,
      cmp.fecha as fecha_compra,
      cmp.num_factura
    from lineas l
    cross join cliente cli
    join public.pedidos_wa_compras_lineas cl
      on lower(cl.descripcion) like '%' || l.prod_lower || '%'
    join public.pedidos_wa_compras cmp on cmp.id = cl.compra_id
    where cmp.fecha <= cli.fecha_pedido
    order by l.prod_lower, cmp.fecha desc, cmp.num_factura desc nulls last, cmp.id desc
  ),
  resuelto as (
    select
      l.*,
      ph.holded_product_id,
      ph.holded_product_name,
      coalesce(hc.tax_rate, tb.tax_rate, uvg.tax_rate, 4)::numeric as iva_resuelto,
      coalesce(hc.price, tb.price, uvg.price, 0)::numeric as precio_base,
      pm.precio_minimo,
      coalesce(hc.fecha, tb.fecha, uvg.fecha) as fecha_base,
      case
        when hc.price is not null then 'historico_cliente'
        when tb.price is not null then 'tarifa_base'
        when uvg.price is not null then 'ultima_venta_global'
        else 'no_resuelto'
      end as fuente_base,
      th.fecha_compra as holded_fecha_compra,
      th.num_factura as holded_num_factura,
      tcw.fecha_compra as wa_fecha_compra,
      tcw.num_factura as wa_num_factura,
      tcw.proveedor_nombre as wa_proveedor
    from lineas l
    left join public.pedidos_wa_productos_holded ph
      on ph.producto_normalizado = l.prod_lower
    left join historico_cliente hc on lower(hc.prod_key) = l.prod_lower
    left join tarifa_base tb on lower(tb.prod_key) = l.prod_lower
    left join ultima_venta_global uvg on lower(uvg.prod_key) = l.prod_lower
    left join precios_minimos pm on pm.holded_product_id = ph.holded_product_id
    left join trazas_holded th on th.holded_product_id = ph.holded_product_id
    left join trazas_compras_wa tcw on tcw.prod_lower = l.prod_lower
  )
  select
    r.id as linea_id,
    r.orden,
    r.producto_normalizado,
    r.cantidad,
    r.unidad,
    r.es_gratis,
    r.iva_resuelto as iva_pct,
    case
      when r.es_gratis then 0
      else greatest(r.precio_base, coalesce(r.precio_minimo, 0))
    end as precio_resuelto,
    case
      when r.es_gratis then 'gratis'
      when r.precio_minimo is not null and r.precio_minimo > r.precio_base
        then 'margen_minimo'
      else r.fuente_base
    end as precio_fuente,
    case
      when r.precio_minimo is not null and r.precio_minimo > r.precio_base
        then current_date
      else r.fecha_base
    end as precio_fecha,
    case
      when r.es_gratis then 0
      else r.cantidad * greatest(r.precio_base, coalesce(r.precio_minimo, 0))
    end::numeric as total_estimado,
    r.holded_product_id,
    r.holded_product_name,
    case
      when r.wa_proveedor is not null then
        'L' || to_char(r.wa_fecha_compra, 'YYMMDD')
            || coalesce(' · ' || r.wa_num_factura, '')
      when r.holded_fecha_compra is not null then
        'L' || to_char(r.holded_fecha_compra, 'YYMMDD')
            || coalesce(' · ' || r.holded_num_factura, '')
      else null
    end as trazabilidad
  from resuelto r
  order by r.orden;
$function$;

revoke execute on function public.pedidos_wa_resolver_completo(uuid)
  from public, anon;
grant execute on function public.pedidos_wa_resolver_completo(uuid)
  to authenticated, service_role;
