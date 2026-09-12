-- La pantalla Productos agrupaba por nombre respetando mayúsculas y espacios
-- internos, así que el mismo producto salía en varias filas: "TOMATE DANIELA KG"
-- y "Tomate Daniela KG", o "NARANJA ZUMO  KG" (doble espacio) y "Naranja Zumo KG".
-- En septiembre eran 12 filas duplicadas de 210, con las ventas y el margen
-- partidos entre ellas y compitiendo por separado en el ranking.
--
-- Se agrupa por public.manager_norm_nombre() (minúsculas + espacios colapsados,
-- sin tocar acentos) y se muestra la grafía más usada. Las mismas claves se
-- aplican a las RPC de detalle por nombre para que la ficha siga cuadrando con
-- la fila desde la que se abre.
--
-- Los joins de coste siguen usando lower(trim(nombre)): normalizar ahí duplicaría
-- filas, porque manager_coste_nombre_calc tiene 26 claves que colisionan al
-- normalizar.

create or replace function public.manager_productos_lista(p_from date, p_to date)
 returns table(product_id text, nombre text, veces bigint, unidades numeric, ventas numeric, ventas_subtotal numeric, cogs numeric, margen numeric, margen_pct numeric, coste_unidad numeric, es_coste_manual boolean, ultima_compra date, ultima_venta date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with agg as (
    select
      max(l.product_id) as product_id_original,
      mode() within group (order by coalesce(nullif(trim(l.nombre), ''), '(sin nombre)')) as nombre,
      count(*) as veces,
      coalesce(sum(l.units), 0) as unidades,
      coalesce(sum(l.total_linea), 0) as ventas,
      coalesce(sum(l.subtotal), 0) as ventas_subtotal,
      coalesce(sum(l.cogs_linea), 0) as cogs,
      coalesce(sum(l.margen_linea), 0) as margen,
      case when sum(l.subtotal) > 0
        then round((sum(l.margen_linea) / sum(l.subtotal)) * 100, 1)
        else null
      end as margen_pct,
      max(l.coste_unidad) as max_coste_linea,
      max(l.fecha) as ultima_venta
    from public.manager_lineas_efectivas l
    where l.fecha between p_from and p_to
      and public.puede_ver_manager()
    group by public.manager_norm_nombre(coalesce(nullif(trim(l.nombre), ''), '(sin nombre)'))
  ),
  productos as (
    select
      agg.*,
      coalesce(agg.product_id_original, ph.holded_product_id) as pid
    from agg
    left join lateral (
      select p.holded_product_id
      from public.pedidos_wa_productos_holded p
      where agg.product_id_original is null
        and p.holded_product_id <> '0'
        and (
          lower(trim(agg.nombre)) = lower(trim(p.holded_product_name))
          or lower(trim(agg.nombre)) = p.producto_normalizado
        )
      order by case when p.source = 'manual' then 0 else 1 end, p.updated_at desc
      limit 1
    ) ph on true
  )
  select
    p.pid, p.nombre, p.veces, p.unidades, p.ventas, p.ventas_subtotal, p.cogs, p.margen, p.margen_pct,
    coalesce(
      mcn.coste_eur,
      case when pc.es_manual then pc.coste_eur end,
      cac.coste_eur, cpc.coste_eur, cnc.coste_eur, pc.coste_eur, p.max_coste_linea
    )::numeric as coste_unidad,
    (mcn.nombre_norm is not null or coalesce(pc.es_manual, false)) as es_coste_manual,
    coalesce(cr.ultima_compra, cac.ultima_compra, pc.ultima_compra) as ultima_compra,
    p.ultima_venta
  from productos p
  left join public.manager_costes_manuales_nombre mcn on mcn.nombre_norm = lower(trim(p.nombre))
  left join public.manager_producto_coste pc on pc.product_id = p.pid
  left join public.manager_coste_alias_calc cac on cac.product_id = p.pid
  left join public.manager_producto_compra_resumen cr on cr.product_id = p.pid
  left join public.manager_coste_producto_calc cpc on cpc.product_id = p.pid
  left join public.manager_coste_nombre_calc cnc on cnc.nombre_norm = lower(trim(p.nombre))
  order by p.ventas_subtotal desc nulls last;
$function$;

create or replace function public.manager_top_productos_margen(p_from date, p_to date, p_limit integer default 10)
 returns table(nombre text, product_id text, unidades numeric, ventas numeric, ventas_subtotal numeric, cogs numeric, margen numeric, margen_pct numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    mode() within group (order by coalesce(nullif(trim(nombre), ''), '(sin nombre)')) as nombre,
    max(product_id) as product_id,
    coalesce(sum(units), 0) as unidades,
    coalesce(sum(total_linea), 0) as ventas,
    coalesce(sum(subtotal), 0) as ventas_subtotal,
    coalesce(sum(cogs_linea), 0) as cogs,
    coalesce(sum(margen_linea), 0) as margen,
    case when sum(subtotal) > 0
      then round((sum(margen_linea) / sum(subtotal)) * 100, 1)
      else null
    end as margen_pct
  from public.manager_lineas_efectivas
  where fecha between p_from and p_to
    and public.puede_ver_manager()
  group by public.manager_norm_nombre(coalesce(nullif(trim(nombre), ''), '(sin nombre)'))
  order by margen desc nulls last
  limit p_limit;
$function$;

create or replace function public.manager_producto_clientes_nombre(p_nombre text, p_from date, p_to date, p_limit integer default 30)
 returns table(contact_name_canon text, veces bigint, unidades numeric, ventas_subtotal numeric, margen numeric, margen_pct numeric, ultima_compra date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(contact_name_canon, '(sin contacto)'),
    count(*), coalesce(sum(units), 0), coalesce(sum(subtotal), 0), coalesce(sum(margen_linea), 0),
    case when sum(subtotal) > 0 then round((sum(margen_linea) / sum(subtotal)) * 100, 1) else null end,
    max(fecha)
  from public.manager_lineas_efectivas
  where public.manager_norm_nombre(nombre) = public.manager_norm_nombre(p_nombre)
    and fecha between p_from and p_to
    and public.puede_ver_manager()
  group by 1 order by sum(subtotal) desc nulls last limit p_limit;
$function$;
