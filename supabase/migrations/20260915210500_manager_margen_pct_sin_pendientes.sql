-- Margen %: las ventas sin coste resuelto (coste_pendiente) ya aportan 0 EUR de
-- margen, pero seguían en el denominador y bajaban el porcentaje. Se añade
-- subtotal_con_coste a las vistas y los % se calculan solo sobre ventas con
-- coste. Los importes (ventas, cogs, margen EUR) no cambian.

create or replace view public.manager_lineas_coste_resuelto with (security_invoker = on) as
 SELECT l.id,
    l.factura_id,
    l.tipo,
    l.subtipo,
    l.fecha,
    l.contact_id,
    l.product_id,
    l.nombre,
    l.descripcion,
    l.sku,
    l.units,
    l.price,
    l.discount,
    l.tax_rate,
    l.subtotal,
    (COALESCE(l.subtotal, 0::numeric) * (1::numeric + COALESCE(l.tax_rate, 0::numeric) / 100::numeric))::numeric(14,4) AS total_linea,
    resolved.coste_unidad,
        CASE
            WHEN resolved.coste_unidad IS NULL THEN NULL::text
            WHEN mcn.coste_eur > 0::numeric THEN 'manual_nombre'::text
            WHEN mcd.coste_eur > 0::numeric OR mcm.coste_eur > 0::numeric THEN 'manual_producto'::text
            WHEN hist.coste_eur > 0::numeric THEN 'compra_historica'::text
            WHEN ap.coste_eur > 0::numeric THEN 'compras_alias_producto'::text
            WHEN aw.coste_eur > 0::numeric THEN 'compras_alias_nombre'::text
            WHEN cpc.coste_eur > 0::numeric THEN 'compras_producto'::text
            WHEN cpw.coste_eur > 0::numeric THEN 'compras_producto_alias'::text
            WHEN cnc.coste_eur > 0::numeric THEN 'compras_nombre'::text
            ELSE 'catalogo_alias'::text
        END AS coste_fuente,
    l.tipo = 'VENTA'::text AND COALESCE(l.subtotal, 0::numeric) <> 0::numeric AND resolved.coste_unidad IS NULL AS coste_pendiente,
    cogs.importe AS cogs_linea,
    (COALESCE(l.subtotal, 0::numeric) - cogs.importe)::numeric(14,4) AS margen_linea,
        CASE
            WHEN resolved.coste_unidad IS NULL THEN 0::numeric
            ELSE COALESCE(l.subtotal, 0::numeric)
        END::numeric(14,4) AS subtotal_con_coste
   FROM manager_lineas l
     LEFT JOIN manager_costes_manuales_nombre mcn ON mcn.nombre_norm = lower(TRIM(BOTH FROM l.nombre)) AND (mcn.fecha_hasta IS NULL OR l.fecha <= mcn.fecha_hasta)
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN cm.fecha_hasta IS NULL OR COALESCE(l.fecha, CURRENT_DATE) <= cm.fecha_hasta THEN cm.coste_eur
                    ELSE NULL::numeric
                END AS coste_eur
           FROM manager_costes_manuales cm
          WHERE cm.product_id = NULLIF(l.product_id, '0'::text) AND cm.fecha_desde <= COALESCE(l.fecha, CURRENT_DATE)
          ORDER BY cm.fecha_desde DESC
         LIMIT 1) mcd ON true
     LEFT JOIN LATERAL ( SELECT m.holded_product_id
           FROM ( SELECT pwph.holded_product_id,
                        CASE
                            WHEN lower(TRIM(BOTH FROM l.nombre)) = lower(pwph.holded_product_name) THEN 0
                            ELSE 1
                        END AS prioridad,
                    pwph.updated_at,
                    pwph.producto_normalizado AS clave
                   FROM pedidos_wa_productos_holded pwph
                  WHERE NULLIF(l.product_id, '0'::text) IS NULL AND pwph.holded_product_id <> '0'::text AND (lower(TRIM(BOTH FROM l.nombre)) = lower(pwph.holded_product_name) OR lower(TRIM(BOTH FROM l.nombre)) = pwph.producto_normalizado)
                UNION ALL
                 SELECT na.holded_product_id,
                    2,
                    na.updated_at,
                    na.nombre_norm
                   FROM manager_coste_nombre_auto na
                  WHERE NULLIF(l.product_id, '0'::text) IS NULL AND na.holded_product_id <> '0'::text AND na.nombre_norm = lower(TRIM(BOTH FROM l.nombre))) m
          ORDER BY m.prioridad, m.updated_at DESC, m.clave
         LIMIT 1) pwph_match ON true
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN cm.fecha_hasta IS NULL OR COALESCE(l.fecha, CURRENT_DATE) <= cm.fecha_hasta THEN cm.coste_eur
                    ELSE NULL::numeric
                END AS coste_eur
           FROM manager_costes_manuales cm
          WHERE cm.product_id = pwph_match.holded_product_id AND cm.fecha_desde <= COALESCE(l.fecha, CURRENT_DATE)
          ORDER BY cm.fecha_desde DESC
         LIMIT 1) mcm ON true
     LEFT JOIN LATERAL ( SELECT h.coste_eur
           FROM manager_coste_producto_historial h
          WHERE h.product_id = COALESCE(NULLIF(l.product_id, '0'::text), pwph_match.holded_product_id) AND h.fecha <= COALESCE(l.fecha, CURRENT_DATE)
          ORDER BY h.fecha DESC
         LIMIT 1) hist ON true
     LEFT JOIN manager_coste_alias_calc ap ON ap.product_id = NULLIF(l.product_id, '0'::text)
     LEFT JOIN manager_coste_alias_calc aw ON aw.product_id = pwph_match.holded_product_id
     LEFT JOIN manager_producto_coste pc2 ON pc2.product_id = pwph_match.holded_product_id
     LEFT JOIN manager_coste_producto_calc cpc ON cpc.product_id = NULLIF(l.product_id, '0'::text)
     LEFT JOIN manager_coste_producto_calc cpw ON cpw.product_id = pwph_match.holded_product_id
     LEFT JOIN manager_coste_nombre_calc cnc ON cnc.nombre_norm = lower(TRIM(BOTH FROM l.nombre))
     CROSS JOIN LATERAL ( SELECT COALESCE(
                CASE
                    WHEN mcn.coste_eur > 0::numeric THEN mcn.coste_eur
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN mcd.coste_eur > 0::numeric THEN mcd.coste_eur
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN mcm.coste_eur > 0::numeric THEN mcm.coste_eur
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN hist.coste_eur > 0::numeric THEN hist.coste_eur
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN ap.coste_eur > 0::numeric THEN ap.coste_eur
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN aw.coste_eur > 0::numeric THEN aw.coste_eur
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN cpc.coste_eur > 0::numeric THEN cpc.coste_eur
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN cpw.coste_eur > 0::numeric THEN cpw.coste_eur
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN cnc.coste_eur > 0::numeric THEN cnc.coste_eur
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN NOT COALESCE(pc2.es_manual, false) AND pc2.coste_eur > 0::numeric THEN pc2.coste_eur
                    ELSE NULL::numeric
                END)::numeric(12,4) AS coste_unidad) resolved
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN resolved.coste_unidad IS NULL THEN COALESCE(l.subtotal, 0::numeric)
                    WHEN COALESCE(l.subtotal, 0::numeric) < 0::numeric THEN (- abs(COALESCE(l.units, 0::numeric))) * resolved.coste_unidad
                    ELSE COALESCE(l.units, 0::numeric) * resolved.coste_unidad
                END::numeric(14,4) AS importe) cogs;

create or replace view public.manager_lineas_efectivas with (security_invoker = true) as
 SELECT l.id,
    l.factura_id,
    l.tipo,
    l.subtipo,
    l.fecha,
    l.contact_id,
    l.product_id,
    l.nombre,
    l.descripcion,
    l.sku,
    l.units,
    l.price,
    l.discount,
    l.tax_rate,
    l.subtotal,
    l.total_linea,
    l.coste_unidad,
    l.cogs_linea,
    l.margen_linea,
    COALESCE(a.alias_to, e.contact_name) AS contact_name_canon,
    e.contact_name AS contact_name_raw,
    l.subtotal_con_coste
   FROM manager_lineas_coste_resuelto l
     JOIN manager_ventas_efectivas e ON e.id = l.factura_id
     LEFT JOIN manager_clientes_alias a ON a.alias_from = e.contact_name;

CREATE OR REPLACE FUNCTION public.manager_resumen_periodo(p_from date, p_to date)
 RETURNS TABLE(ventas_n bigint, ventas_subtotal numeric, ventas_total numeric, pendiente_cobro numeric, compras_n bigint, compras_subtotal numeric, compras_total numeric, cogs numeric, ventas_lineas numeric, margen_real numeric, margen_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with v as (
    select count(*) as n, coalesce(sum(subtotal),0) as subtotal, coalesce(sum(total),0) as total,
           coalesce(sum(case when subtipo='waybill' then total else 0 end),0) as pend
    from public.manager_ventas_efectivas
    where fecha between p_from and p_to and public.puede_ver_manager()
  ),
  c as (
    select count(*) as n, coalesce(sum(subtotal),0) as subtotal, coalesce(sum(total),0) as total
    from public.manager_facturas
    where tipo = 'COMPRA' and fecha between p_from and p_to and public.puede_ver_manager()
  ),
  m as (
    select coalesce(sum(cogs_linea),0) as cogs, coalesce(sum(subtotal),0) as ventas_lineas,
           coalesce(sum(subtotal_con_coste),0) as ventas_con_coste
    from public.manager_lineas_efectivas
    where fecha between p_from and p_to and public.puede_ver_manager()
  )
  select v.n, v.subtotal, v.total, v.pend, c.n, c.subtotal, c.total, m.cogs, m.ventas_lineas,
    (m.ventas_lineas - m.cogs),
    case when m.ventas_con_coste > 0 then round(((m.ventas_lineas-m.cogs)/m.ventas_con_coste)*100,1) else null end
  from v, c, m;
$function$;

CREATE OR REPLACE FUNCTION public.manager_resumen_comparativo(p_from date, p_to date)
 RETURNS TABLE(ventas numeric, ventas_ant numeric, ventas_delta_pct numeric, compras numeric, compras_ant numeric, compras_delta_pct numeric, margen numeric, margen_ant numeric, margen_delta_pct numeric, pendiente_cobro numeric, docs bigint, cogs numeric, margen_pct numeric, comp_from date, comp_to date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with span as (
    select (p_to - p_from + 1)::int as ndias
  ),
  ranges as (
    select
      p_from                                     as actual_from,
      p_to                                       as actual_to,
      (p_from - (select ndias from span))::date  as ant_from,
      (p_from - 1)::date                         as ant_to
  ),
  v_act as (
    select
      coalesce(sum(e.total), 0)                                               as ventas,
      coalesce(sum(case when e.subtipo='waybill' then e.total else 0 end), 0) as pendiente,
      count(distinct e.id)                                                    as docs
    from public.manager_ventas_efectivas e, ranges r
    where e.fecha between r.actual_from and r.actual_to
      and public.puede_ver_manager()
  ),
  v_ant as (
    select coalesce(sum(e.total), 0) as ventas
    from public.manager_ventas_efectivas e, ranges r
    where e.fecha between r.ant_from and r.ant_to
  ),
  c_act as (
    select coalesce(sum(total), 0) as compras
    from public.manager_facturas, ranges r
    where tipo = 'COMPRA' and fecha between r.actual_from and r.actual_to
  ),
  c_ant as (
    select coalesce(sum(total), 0) as compras
    from public.manager_facturas, ranges r
    where tipo = 'COMPRA' and fecha between r.ant_from and r.ant_to
  ),
  m_act as (
    select coalesce(sum(margen_linea), 0)       as margen,
           coalesce(sum(cogs_linea), 0)         as cogs,
           coalesce(sum(subtotal_con_coste), 0) as ventas_con_coste
    from public.manager_lineas_efectivas, ranges r
    where fecha between r.actual_from and r.actual_to
  ),
  m_ant as (
    select coalesce(sum(margen_linea), 0) as margen
    from public.manager_lineas_efectivas, ranges r
    where fecha between r.ant_from and r.ant_to
  )
  select
    v_act.ventas, v_ant.ventas,
    case when v_ant.ventas > 0
         then round(((v_act.ventas - v_ant.ventas) / v_ant.ventas) * 100, 1)
         else null end,
    c_act.compras, c_ant.compras,
    case when c_ant.compras > 0
         then round(((c_act.compras - c_ant.compras) / c_ant.compras) * 100, 1)
         else null end,
    m_act.margen, m_ant.margen,
    case when m_ant.margen != 0
         then round(((m_act.margen - m_ant.margen) / abs(m_ant.margen)) * 100, 1)
         else null end,
    v_act.pendiente,
    v_act.docs,
    m_act.cogs,
    case when m_act.ventas_con_coste > 0
         then round((m_act.margen / m_act.ventas_con_coste) * 100, 1)
         else null end,
    r.ant_from, r.ant_to
  from v_act, v_ant, c_act, c_ant, m_act, m_ant, ranges r;
$function$;

CREATE OR REPLACE FUNCTION public.manager_top_clientes_margen(p_from date, p_to date, p_limit integer DEFAULT 10)
 RETURNS TABLE(contact_name_canon text, docs bigint, unidades numeric, ventas numeric, ventas_subtotal numeric, cogs numeric, margen numeric, margen_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cab as (
    select
      coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
      count(distinct id) as docs,
      coalesce(sum(total), 0) as ventas_total
    from public.manager_ventas_efectivas_canon
    where fecha between p_from and p_to
      and public.puede_ver_manager()
    group by 1
  ), lin as (
    select
      coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
      coalesce(sum(units), 0) as unidades,
      coalesce(sum(subtotal), 0) as ventas_subtotal,
      coalesce(sum(subtotal_con_coste), 0) as ventas_con_coste,
      coalesce(sum(cogs_linea), 0) as cogs,
      coalesce(sum(margen_linea), 0) as margen
    from public.manager_lineas_efectivas
    where fecha between p_from and p_to
    group by 1
  )
  select
    cab.contact_name_canon,
    cab.docs,
    coalesce(lin.unidades, 0),
    cab.ventas_total,
    coalesce(lin.ventas_subtotal, 0),
    coalesce(lin.cogs, 0),
    coalesce(lin.margen, 0),
    case when coalesce(lin.ventas_con_coste, 0) > 0
      then round((lin.margen / lin.ventas_con_coste) * 100, 1)
      else null
    end
  from cab
  left join lin using (contact_name_canon)
  order by coalesce(lin.margen, 0) desc nulls last
  limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.manager_top_productos_margen(p_from date, p_to date, p_limit integer DEFAULT 10)
 RETURNS TABLE(nombre text, product_id text, unidades numeric, ventas numeric, ventas_subtotal numeric, cogs numeric, margen numeric, margen_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    mode() within group (order by coalesce(nullif(trim(nombre), ''), '(sin nombre)')) as nombre,
    max(product_id) as product_id,
    coalesce(sum(units), 0) as unidades,
    coalesce(sum(total_linea), 0) as ventas,
    coalesce(sum(subtotal), 0) as ventas_subtotal,
    coalesce(sum(cogs_linea), 0) as cogs,
    coalesce(sum(margen_linea), 0) as margen,
    case when sum(subtotal_con_coste) > 0
      then round((sum(margen_linea) / sum(subtotal_con_coste)) * 100, 1)
      else null
    end as margen_pct
  from public.manager_lineas_efectivas
  where fecha between p_from and p_to
    and public.puede_ver_manager()
  group by public.manager_norm_nombre(coalesce(nullif(trim(nombre), ''), '(sin nombre)'))
  order by margen desc nulls last
  limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.manager_clientes_lista(p_from date, p_to date)
 RETURNS TABLE(contact_name_canon text, contact_ids text[], docs bigint, ventas numeric, ventas_subtotal numeric, cogs numeric, margen numeric, margen_pct numeric, pendiente_cobro numeric, ultima_compra date, num_aliases integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.puede_ver_clientes() then
    raise exception 'sin permiso para consultar clientes' using errcode = '42501';
  end if;

  return query
  with cab as (
    select
      coalesce(e.contact_name_canon, '(sin contacto)') as contact_name_canon,
      array_agg(distinct e.contact_id) filter (where e.contact_id is not null) as contact_ids,
      count(distinct e.id)                                                       as docs,
      coalesce(sum(e.total), 0)                                                  as ventas,
      coalesce(sum(case when e.subtipo = 'waybill' then e.total else 0 end), 0) as pendiente,
      max(e.fecha)                                                               as ultima_compra,
      count(distinct e.contact_name)                                             as num_alias
    from public.manager_ventas_efectivas_canon e
    where e.fecha between p_from and p_to
    group by 1
  ),
  lin as (
    select
      coalesce(l.contact_name_canon, '(sin contacto)') as contact_name_canon,
      coalesce(sum(l.subtotal), 0)           as ventas_subtotal,
      coalesce(sum(l.subtotal_con_coste), 0) as ventas_con_coste,
      coalesce(sum(l.cogs_linea), 0)         as cogs,
      coalesce(sum(l.margen_linea), 0)       as margen
    from public.manager_lineas_efectivas l
    where l.fecha between p_from and p_to
    group by 1
  )
  select
    cab.contact_name_canon,
    cab.contact_ids,
    cab.docs,
    cab.ventas,
    coalesce(lin.ventas_subtotal, 0) as ventas_subtotal,
    coalesce(lin.cogs, 0)            as cogs,
    coalesce(lin.margen, 0)          as margen,
    case when coalesce(lin.ventas_con_coste, 0) > 0
         then round((lin.margen / lin.ventas_con_coste) * 100, 1)
         else null end               as margen_pct,
    cab.pendiente                    as pendiente_cobro,
    cab.ultima_compra,
    cab.num_alias::int               as num_aliases
  from cab
  left join lin using (contact_name_canon)
  order by cab.ventas desc nulls last;
end;
$function$;

CREATE OR REPLACE FUNCTION public.manager_productos_lista(p_from date, p_to date)
 RETURNS TABLE(product_id text, nombre text, veces bigint, unidades numeric, ventas numeric, ventas_subtotal numeric, cogs numeric, margen numeric, margen_pct numeric, coste_unidad numeric, es_coste_manual boolean, ultima_compra date, ultima_venta date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      case when sum(l.subtotal_con_coste) > 0
        then round((sum(l.margen_linea) / sum(l.subtotal_con_coste)) * 100, 1)
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
    p.pid,
    p.nombre,
    p.veces,
    p.unidades,
    p.ventas,
    p.ventas_subtotal,
    p.cogs,
    p.margen,
    p.margen_pct,
    coalesce(
      mcn.coste_eur,
      case when pc.es_manual then pc.coste_eur end,
      cac.coste_eur,
      cpc.coste_eur,
      cnc.coste_eur,
      pc.coste_eur,
      p.max_coste_linea
    )::numeric as coste_unidad,
    (mcn.nombre_norm is not null or coalesce(pc.es_manual, false)) as es_coste_manual,
    coalesce(cr.ultima_compra, cac.ultima_compra, pc.ultima_compra) as ultima_compra,
    p.ultima_venta
  from productos p
  left join public.manager_costes_manuales_nombre mcn
    on mcn.nombre_norm = lower(trim(p.nombre))
  left join public.manager_producto_coste pc on pc.product_id = p.pid
  left join public.manager_coste_alias_calc cac on cac.product_id = p.pid
  left join public.manager_producto_compra_resumen cr on cr.product_id = p.pid
  left join public.manager_coste_producto_calc cpc on cpc.product_id = p.pid
  left join public.manager_coste_nombre_calc cnc on cnc.nombre_norm = lower(trim(p.nombre))
  order by p.ventas_subtotal desc nulls last;
$function$;

CREATE OR REPLACE FUNCTION public.manager_cliente_productos(p_contact_name_canon text, p_from date, p_to date, p_limit integer DEFAULT 30)
 RETURNS TABLE(nombre text, product_id text, veces bigint, unidades numeric, ventas_subtotal numeric, cogs numeric, margen numeric, margen_pct numeric, ultima_compra date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    mode() within group (order by coalesce(nullif(trim(nombre), ''), '(sin nombre)')),
    max(product_id),
    count(*), coalesce(sum(units), 0), coalesce(sum(subtotal), 0),
    coalesce(sum(cogs_linea), 0), coalesce(sum(margen_linea), 0),
    case when sum(subtotal_con_coste) > 0 then round((sum(margen_linea) / sum(subtotal_con_coste)) * 100, 1) else null end,
    max(fecha)
  from public.manager_lineas_efectivas
  where coalesce(contact_name_canon, '(sin contacto)') = p_contact_name_canon
    and fecha between p_from and p_to and public.puede_ver_clientes()
  group by public.manager_norm_nombre(coalesce(nullif(trim(nombre), ''), '(sin nombre)'))
  order by sum(subtotal) desc nulls last limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.manager_cliente_margen_detalle(p_contact_name_canon text, p_from date, p_to date, p_limit integer DEFAULT 20)
 RETURNS TABLE(product_id text, nombre text, unidades numeric, ventas_subtotal numeric, cogs numeric, margen numeric, margen_pct numeric, margen_pct_global numeric, delta_pp numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cliente as (
    select l.product_id, l.nombre,
           sum(l.units)::numeric as unidades, sum(l.subtotal)::numeric as ventas_subtotal,
           sum(l.subtotal_con_coste)::numeric as ventas_con_coste,
           sum(l.cogs_linea)::numeric as cogs, sum(l.margen_linea)::numeric as margen
    from public.manager_lineas_efectivas l
    where coalesce(l.contact_name_canon, '(sin contacto)') = p_contact_name_canon
      and l.fecha between p_from and p_to and l.product_id is not null
      and public.puede_ver_clientes()
    group by l.product_id, l.nombre having sum(l.subtotal) > 0
  ),
  global_prod as (
    select l.product_id, sum(l.subtotal_con_coste)::numeric as v_sub, sum(l.margen_linea)::numeric as v_mg
    from public.manager_lineas_efectivas l
    where l.fecha between p_from and p_to and l.product_id is not null
      and public.puede_ver_clientes()
    group by l.product_id having sum(l.subtotal) > 0
  )
  select c.product_id, c.nombre, c.unidades, c.ventas_subtotal, c.cogs, c.margen,
    case when c.ventas_con_coste > 0 then round((c.margen / c.ventas_con_coste) * 100, 1) else null end,
    case when g.v_sub > 0 then round((g.v_mg / g.v_sub) * 100, 1) else null end,
    case when c.ventas_con_coste > 0 and g.v_sub > 0
         then round(((c.margen / c.ventas_con_coste) - (g.v_mg / g.v_sub)) * 100, 1) else null end
  from cliente c left join global_prod g on g.product_id = c.product_id
  order by c.margen desc nulls last limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.manager_cliente_evolucion_mensual(p_contact_name_canon text, p_meses integer DEFAULT 12)
 RETURNS TABLE(mes_iso date, anio integer, mes integer, docs integer, ventas numeric, cogs numeric, margen numeric, margen_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with months as (
    select generate_series(
      (date_trunc('month', current_date) - make_interval(months => greatest(p_meses,1) - 1))::date,
      date_trunc('month', current_date)::date, interval '1 month'
    )::date as m
  ),
  cab as (
    select date_trunc('month', e.fecha)::date as mes_iso,
           count(distinct e.id)::int as docs, sum(e.total)::numeric as ventas
    from public.manager_ventas_efectivas_canon e
    where coalesce(e.contact_name_canon, '(sin contacto)') = p_contact_name_canon
      and e.fecha >= (date_trunc('month', current_date) - make_interval(months => greatest(p_meses,1) - 1))::date
      and public.puede_ver_clientes()
    group by 1
  ),
  lin as (
    select date_trunc('month', l.fecha)::date as mes_iso,
           sum(l.subtotal_con_coste)::numeric as ventas_con_coste, sum(l.cogs_linea)::numeric as cogs,
           sum(l.margen_linea)::numeric as margen
    from public.manager_lineas_efectivas l
    where coalesce(l.contact_name_canon, '(sin contacto)') = p_contact_name_canon
      and l.fecha >= (date_trunc('month', current_date) - make_interval(months => greatest(p_meses,1) - 1))::date
      and public.puede_ver_clientes()
    group by 1
  )
  select months.m, extract(year from months.m)::int, extract(month from months.m)::int,
    coalesce(cab.docs, 0), coalesce(cab.ventas, 0), coalesce(lin.cogs, 0), coalesce(lin.margen, 0),
    case when coalesce(lin.ventas_con_coste, 0) > 0
         then round((lin.margen / lin.ventas_con_coste) * 100, 1) else null end
  from months left join cab on cab.mes_iso = months.m left join lin on lin.mes_iso = months.m
  order by months.m;
$function$;

CREATE OR REPLACE FUNCTION public.manager_producto_clientes(p_product_id text, p_from date, p_to date, p_limit integer DEFAULT 30)
 RETURNS TABLE(contact_name_canon text, veces bigint, unidades numeric, ventas_subtotal numeric, margen numeric, margen_pct numeric, ultima_compra date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(contact_name_canon, '(sin contacto)'),
    count(*), coalesce(sum(units), 0), coalesce(sum(subtotal), 0), coalesce(sum(margen_linea), 0),
    case when sum(subtotal_con_coste) > 0 then round((sum(margen_linea) / sum(subtotal_con_coste)) * 100, 1) else null end,
    max(fecha)
  from public.manager_lineas_efectivas
  where product_id = p_product_id and fecha between p_from and p_to
    and public.puede_ver_manager()
  group by 1 order by sum(subtotal) desc nulls last limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.manager_producto_clientes_nombre(p_nombre text, p_from date, p_to date, p_limit integer DEFAULT 30)
 RETURNS TABLE(contact_name_canon text, veces bigint, unidades numeric, ventas_subtotal numeric, margen numeric, margen_pct numeric, ultima_compra date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(contact_name_canon, '(sin contacto)'),
    count(*), coalesce(sum(units), 0), coalesce(sum(subtotal), 0), coalesce(sum(margen_linea), 0),
    case when sum(subtotal_con_coste) > 0 then round((sum(margen_linea) / sum(subtotal_con_coste)) * 100, 1) else null end,
    max(fecha)
  from public.manager_lineas_efectivas
  where public.manager_norm_nombre(nombre) = public.manager_norm_nombre(p_nombre)
    and fecha between p_from and p_to
    and public.puede_ver_manager()
  group by 1 order by sum(subtotal) desc nulls last limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.manager_facturas_lista(p_from date, p_to date, p_tipo text DEFAULT NULL::text, p_subtipo text DEFAULT NULL::text, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id text, tipo text, subtipo text, doc_number text, contact_id text, contact_name_raw text, contact_name_canon text, fecha date, fecha_vencimiento date, subtotal numeric, total numeric, cogs numeric, margen numeric, margen_pct numeric, costes_pendientes bigint, payments_pending numeric, status integer, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with margen as (
    select
      l.factura_id,
      coalesce(sum(l.cogs_linea), 0) as cogs,
      coalesce(sum(l.subtotal), 0) as ventas_lineas,
      coalesce(sum(l.subtotal_con_coste), 0) as ventas_con_coste,
      count(*) filter (where l.coste_pendiente) as costes_pendientes
    from public.manager_lineas_coste_resuelto l
    where l.fecha between p_from and p_to
    group by l.factura_id
  ),
  filtered as (
    select f.*, coalesce(a.alias_to, f.contact_name) as contact_name_canon_col
    from public.manager_facturas f
    left join public.manager_clientes_alias a on a.alias_from = f.contact_name
    where f.fecha between p_from and p_to
      and (p_tipo is null or f.tipo = p_tipo)
      and (p_subtipo is null or f.subtipo = p_subtipo)
      and (
        p_q is null or p_q = ''
        or f.doc_number ilike '%' || p_q || '%'
        or f.contact_name ilike '%' || p_q || '%'
        or coalesce(a.alias_to, '') ilike '%' || p_q || '%'
      )
      and public.puede_ver_manager()
  )
  select
    f.id,
    f.tipo,
    f.subtipo,
    f.doc_number,
    f.contact_id,
    f.contact_name as contact_name_raw,
    f.contact_name_canon_col,
    f.fecha,
    f.fecha_vencimiento,
    f.subtotal,
    f.total,
    coalesce(m.cogs, 0),
    coalesce(m.ventas_lineas - m.cogs, 0),
    case
      when coalesce(m.ventas_con_coste, 0) > 0
        then round(((m.ventas_lineas - m.cogs) / m.ventas_con_coste) * 100, 1)
      else null
    end,
    coalesce(m.costes_pendientes, 0),
    f.payments_pending,
    f.status,
    count(*) over ()
  from filtered f
  left join margen m on m.factura_id = f.id
  order by f.fecha desc, f.doc_number desc
  limit p_limit
  offset p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_productos_anomalos(p_dias integer DEFAULT 30)
 RETURNS TABLE(product_id text, nombre text, unidades numeric, ventas numeric, margen numeric, margen_pct numeric, motivo text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with agg as (
    select
      max(product_id)                                    as product_id,
      coalesce(nullif(trim(nombre), ''), '(sin nombre)') as nombre,
      coalesce(sum(units), 0)        as unidades,
      coalesce(sum(subtotal), 0)     as ventas,
      coalesce(sum(subtotal_con_coste), 0) as ventas_con_coste,
      coalesce(sum(margen_linea), 0) as margen,
      bool_and(coste_unidad is null) as todas_sin_coste
    from public.manager_lineas_efectivas
    where fecha >= current_date - p_dias
    group by coalesce(nullif(trim(nombre), ''), '(sin nombre)')
    having coalesce(sum(subtotal), 0) > 50
  )
  select
    product_id, nombre, unidades, ventas, margen,
    round((margen / nullif(ventas_con_coste, 0)) * 100, 1) as margen_pct,
    case
      when todas_sin_coste then 'sin_coste'
      when (margen / nullif(ventas_con_coste, 0)) * 100 < 5  then 'margen_bajo'
      when (margen / nullif(ventas_con_coste, 0)) * 100 > 70 then 'margen_excesivo'
      else null
    end as motivo
  from agg
  where todas_sin_coste
     or (margen / nullif(ventas_con_coste, 0)) * 100 < 5
     or (margen / nullif(ventas_con_coste, 0)) * 100 > 70
  order by ventas desc
  limit 30;
$function$;

CREATE OR REPLACE FUNCTION public.manager_asesor_ia_payload(p_fecha date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with dia as (
    select contact_name_canon as cliente, nombre,
      sum(units)                                                          as uds,
      round(sum(subtotal)::numeric, 2)                                    as venta,
      round(sum(cogs_linea)::numeric, 2)                                  as coste,
      round((sum(subtotal) / nullif(sum(units), 0))::numeric, 3)          as pvp_dia,
      round(avg(coste_unidad)::numeric, 3)                                as coste_unit,
      round((sum(margen_linea) / nullif(sum(subtotal_con_coste), 0) * 100)::numeric, 1) as margen_pct
    from manager_lineas_efectivas
    where tipo = 'VENTA' and fecha = p_fecha and units > 0 and subtotal > 0
      and contact_name_canon is not null
    group by 1, 2
  ),
  hist_cli as (
    select contact_name_canon as cliente, nombre,
      round((sum(subtotal) / nullif(sum(units), 0))::numeric, 3) as pvp_cli_90d
    from manager_lineas_efectivas
    where tipo = 'VENTA' and fecha >= p_fecha - 90 and fecha < p_fecha and units > 0
    group by 1, 2
  ),
  mercado as (
    select nombre,
      round((percentile_cont(0.5)  within group (order by price))::numeric, 3) as pvp_mkt_med,
      round((percentile_cont(0.75) within group (order by price))::numeric, 3) as pvp_mkt_p75,
      count(distinct contact_name_canon)                                       as n_clientes_mkt
    from manager_lineas_efectivas
    where tipo = 'VENTA' and fecha >= p_fecha - 90 and units > 0 and price > 0
    group by 1
  ),
  base as (
    select d.cliente, d.venta as venta_linea,
      jsonb_build_object(
        'producto',     d.nombre,
        'uds',          d.uds,
        'venta',        d.venta,
        'pvp_dia',      d.pvp_dia,
        'coste',        d.coste_unit,
        'margen_pct',   d.margen_pct,
        'pvp_cliente_90d', h.pvp_cli_90d,
        'pvp_mercado_med', m.pvp_mkt_med,
        'pvp_mercado_p75', m.pvp_mkt_p75,
        'clientes_mercado', m.n_clientes_mkt
      ) as linea,
      row_number() over (partition by d.cliente order by d.venta desc) as rn
    from dia d
    left join hist_cli h using (cliente, nombre)
    left join mercado  m using (nombre)
  ),
  clientes as (
    select cliente,
      round(sum(venta_linea), 2) as venta_cli,
      jsonb_agg(linea order by venta_linea desc) filter (where rn <= 15) as lineas
    from base
    group by cliente
    having sum(venta_linea) >= 20
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'total_venta', coalesce((select round(sum(venta_cli), 2) from clientes), 0),
    'n_clientes',  coalesce((select count(*) from clientes), 0),
    'clientes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cliente', cliente, 'venta', venta_cli, 'lineas', lineas
      ) order by venta_cli desc)
      from clientes
    ), '[]'::jsonb)
  );
$function$;
