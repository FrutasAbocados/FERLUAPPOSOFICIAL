-- ============================================================================
-- Manager — RPCs ProductosView (lista + drill-in)
-- ============================================================================
-- 3 funciones (security invoker):
--   manager_productos_lista(from, to)
--   manager_producto_clientes(product_id, from, to)
--   manager_producto_compras(product_id, limit)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Lista de TODOS los productos vendidos en el periodo, con coste y margen
-- ---------------------------------------------------------------------------
create or replace function public.manager_productos_lista(p_from date, p_to date)
returns table(
  product_id      text,
  nombre          text,
  veces           bigint,
  unidades        numeric,
  ventas          numeric,    -- total con IVA aprox
  ventas_subtotal numeric,
  cogs            numeric,
  margen          numeric,
  margen_pct      numeric,
  coste_unidad    numeric,
  es_coste_manual boolean,
  ultima_compra   date,
  ultima_venta    date
) language sql security invoker stable as $$
  select
    l.product_id,
    coalesce(nullif(trim(l.nombre), ''), '(sin nombre)') as nombre,
    count(*)                              as veces,
    coalesce(sum(l.units), 0)             as unidades,
    coalesce(sum(l.total_linea), 0)       as ventas,
    coalesce(sum(l.subtotal), 0)          as ventas_subtotal,
    coalesce(sum(l.cogs_linea), 0)        as cogs,
    coalesce(sum(l.margen_linea), 0)      as margen,
    case when sum(l.subtotal) > 0
         then round((sum(l.margen_linea) / sum(l.subtotal)) * 100, 1)
         else null end                    as margen_pct,
    max(l.coste_unidad)                   as coste_unidad,
    bool_or(coalesce(pc.es_manual, false)) as es_coste_manual,
    max(pc.ultima_compra)                 as ultima_compra,
    max(l.fecha)                          as ultima_venta
  from public.manager_lineas_efectivas l
  left join public.manager_producto_coste pc on pc.product_id = l.product_id
  where l.fecha between p_from and p_to
  group by 1, 2
  order by ventas_subtotal desc nulls last;
$$;


-- ---------------------------------------------------------------------------
-- Clientes que compran un producto en el periodo
-- ---------------------------------------------------------------------------
create or replace function public.manager_producto_clientes(
  p_product_id text, p_from date, p_to date, p_limit int default 30
)
returns table(
  contact_name_canon text,
  veces              bigint,
  unidades           numeric,
  ventas_subtotal    numeric,
  margen             numeric,
  margen_pct         numeric,
  ultima_compra      date
) language sql security invoker stable as $$
  select
    coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
    count(*)                                       as veces,
    coalesce(sum(units), 0)                        as unidades,
    coalesce(sum(subtotal), 0)                     as ventas_subtotal,
    coalesce(sum(margen_linea), 0)                 as margen,
    case when sum(subtotal) > 0
         then round((sum(margen_linea) / sum(subtotal)) * 100, 1)
         else null end                             as margen_pct,
    max(fecha)                                     as ultima_compra
  from public.manager_lineas_efectivas
  where product_id = p_product_id
    and fecha between p_from and p_to
  group by 1
  order by ventas_subtotal desc nulls last
  limit p_limit;
$$;


-- ---------------------------------------------------------------------------
-- Historial de compras (precio pagado al proveedor) — todas las disponibles
-- ---------------------------------------------------------------------------
create or replace function public.manager_producto_compras(
  p_product_id text, p_limit int default 60
)
returns table(
  fecha           date,
  contact_id      text,
  contact_name    text,
  units           numeric,
  subtotal        numeric,
  precio_unit     numeric  -- subtotal / units
) language sql security invoker stable as $$
  select
    l.fecha,
    l.contact_id,
    coalesce(c.nombre, l.contact_id, '(sin proveedor)') as contact_name,
    l.units,
    l.subtotal,
    case when l.units > 0 then (l.subtotal / l.units)::numeric(12,4) else null end as precio_unit
  from public.manager_lineas l
  left join public.manager_contactos c on c.id = l.contact_id
  where l.product_id = p_product_id
    and l.tipo = 'COMPRA'
    and l.units > 0
    and l.subtotal > 0
  order by l.fecha desc
  limit p_limit;
$$;
