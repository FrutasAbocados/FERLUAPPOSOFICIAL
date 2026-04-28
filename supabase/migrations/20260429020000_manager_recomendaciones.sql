-- ============================================================================
-- Manager — RPC manager_recomendaciones()
-- ============================================================================
-- Insights operativos accionables. Cada fila es una "recomendación" con un
-- tipo y un payload textual + numérico para mostrar.
--
-- Tipos:
--   'vendiendo_bajo_coste'    → línea con precio venta < coste registrado
--   'cliente_dejo_producto'   → cliente top de un producto y 30d sin comprarlo
--   'cliente_caida_pedido'    → cliente con caída >40% mes vs mes anterior
--   'cliente_subida_pedido'   → cliente con subida >40% mes vs mes anterior
--   'producto_se_apaga'       → producto que vendía bien y 14d casi sin venta
-- ============================================================================

create or replace function public.manager_recomendaciones()
returns table(
  tipo          text,
  prioridad     int,            -- 1=critica, 2=alta, 3=media
  cliente       text,
  producto      text,
  valor_eur     numeric,        -- importe asociado al insight
  detalle       text,
  fecha_ref     date
) language sql security invoker stable as $$
  -- 1. Vendiendo bajo coste (margen negativo en línea, últimos 30d)
  with bajo_coste as (
    select
      'vendiendo_bajo_coste'::text  as tipo,
      1                              as prioridad,
      l.contact_name_canon           as cliente,
      l.nombre                       as producto,
      sum(l.margen_linea)::numeric   as valor,
      'precio venta '
        || round((l.subtotal / nullif(l.units,0))::numeric, 2)::text || '€'
        || ' < coste '
        || round(l.coste_unidad::numeric, 2)::text || '€'  as detalle,
      max(l.fecha)                   as fecha_ref
    from public.manager_lineas_efectivas l
    where l.fecha >= current_date - 30
      and l.margen_linea < -0.5
      and l.units > 0
      and l.coste_unidad is not null
    group by l.contact_name_canon, l.nombre, l.coste_unidad, l.subtotal, l.units
    order by sum(l.margen_linea) asc
    limit 10
  ),

  -- 2. Caída de pedido cliente (mes actual vs mes anterior, >40% bajada)
  ventas_mes as (
    select
      coalesce(contact_name_canon, '(sin contacto)') as cliente,
      coalesce(sum(case when fecha >= date_trunc('month', current_date)
                        then total else 0 end), 0)               as actual,
      coalesce(sum(case when fecha >= date_trunc('month', current_date) - interval '1 month'
                        and fecha <  date_trunc('month', current_date)
                        then total else 0 end), 0)               as anterior
    from public.manager_ventas_efectivas_canon
    where fecha >= date_trunc('month', current_date) - interval '1 month'
    group by 1
  ),
  caida as (
    select
      'cliente_caida_pedido'::text as tipo,
      2                            as prioridad,
      cliente, ''::text as producto,
      (actual - anterior)::numeric as valor,
      'mes actual '   || round(actual,   0)::text || '€ vs mes anterior ' || round(anterior, 0)::text || '€ ('
        || round(((actual - anterior) / nullif(anterior, 0)) * 100, 0)::text || '%)'  as detalle,
      current_date                 as fecha_ref
    from ventas_mes
    where anterior > 200
      and actual < anterior * 0.6
    order by anterior - actual desc
    limit 10
  ),
  subida as (
    select
      'cliente_subida_pedido'::text as tipo,
      3                             as prioridad,
      cliente, ''::text as producto,
      (actual - anterior)::numeric as valor,
      'mes actual '   || round(actual,   0)::text || '€ vs mes anterior ' || round(anterior, 0)::text || '€ (+'
        || round(((actual - anterior) / nullif(anterior, 0)) * 100, 0)::text || '%)'  as detalle,
      current_date                 as fecha_ref
    from ventas_mes
    where anterior > 200
      and actual > anterior * 1.4
    order by actual - anterior desc
    limit 5
  ),

  -- 3. Cliente que dejó de comprar uno de sus productos top (top en 60-90d, 0 en últimos 30d)
  cliente_top as (
    select contact_name_canon, nombre, product_id,
           coalesce(sum(units), 0) as units_top
    from public.manager_lineas_efectivas
    where fecha >= current_date - 90 and fecha < current_date - 30
      and product_id is not null
    group by 1, 2, 3
    having coalesce(sum(units), 0) >= 20
  ),
  cliente_reciente as (
    select contact_name_canon, product_id, sum(units) as units_rec
    from public.manager_lineas_efectivas
    where fecha >= current_date - 30
    group by 1, 2
  ),
  dejo_producto as (
    select
      'cliente_dejo_producto'::text as tipo,
      2                              as prioridad,
      ct.contact_name_canon          as cliente,
      ct.nombre                      as producto,
      ct.units_top                   as valor,
      ct.units_top::int::text || ' ud en 60-90d previos · 0 ud últimos 30d' as detalle,
      current_date                   as fecha_ref
    from cliente_top ct
    left join cliente_reciente cr
      on cr.contact_name_canon = ct.contact_name_canon and cr.product_id = ct.product_id
    where coalesce(cr.units_rec, 0) = 0
    order by ct.units_top desc
    limit 8
  ),

  -- 4. Producto se apaga (vendía bien y últimos 14d casi nada)
  prod_top as (
    select product_id, max(nombre) as nombre, sum(units) as units_top
    from public.manager_lineas_efectivas
    where fecha >= current_date - 90 and fecha < current_date - 14
      and product_id is not null
    group by product_id
    having sum(units) >= 50
  ),
  prod_reciente as (
    select product_id, sum(units) as units_rec
    from public.manager_lineas_efectivas
    where fecha >= current_date - 14
    group by product_id
  ),
  apaga as (
    select
      'producto_se_apaga'::text as tipo,
      3                          as prioridad,
      ''::text                   as cliente,
      pt.nombre                  as producto,
      pt.units_top               as valor,
      pt.units_top::int::text || ' ud en 14-90d previos · '
        || coalesce(pr.units_rec, 0)::int::text || ' ud últimos 14d' as detalle,
      current_date               as fecha_ref
    from prod_top pt
    left join prod_reciente pr using (product_id)
    where coalesce(pr.units_rec, 0) < pt.units_top * 0.15
    order by pt.units_top desc
    limit 8
  )

  select * from (
    select * from bajo_coste
    union all select * from caida
    union all select * from dejo_producto
    union all select * from apaga
    union all select * from subida
  ) all_recs
  order by prioridad, abs(coalesce(valor, 0)) desc nulls last;
$$;
