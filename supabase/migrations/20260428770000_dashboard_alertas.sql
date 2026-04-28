-- ============================================================================
-- Dashboard — RPCs de alertas (cruza datos entre módulos)
-- ============================================================================
-- 5 RPCs (security invoker, requiere admin_full por RLS de las tablas base):
--   dashboard_pendiente_mismatch()    — Manager vs Cobros, deuda discrepa
--   dashboard_productos_anomalos(d)   — productos con margen extremo
--   dashboard_clientes_inactivos(d)   — clientes con cadencia rota
--   dashboard_costes_subiendo(d, p)   — coste sube X% vs trimestre
--   dashboard_kpis_hoy()              — ventas/compras hoy + último sync
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: normaliza nombres para matching (lowercase + trim + sin paréntesis)
-- ---------------------------------------------------------------------------
create or replace function public._norm_nombre(p text)
returns text language sql immutable as $$
  select trim(regexp_replace(lower(coalesce(p, '')), '\s*\(.*?\)\s*', ' ', 'g'))
$$;


-- ---------------------------------------------------------------------------
-- 1) Discrepancia Manager vs Cobros
--    Para cada cliente con pendiente en Cobros, compara con sum de waybills
--    del mes en curso en Manager.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_pendiente_mismatch()
returns table(
  cliente_nombre        text,
  pendiente_cobros      numeric,
  pendiente_manager_mes numeric,
  diferencia            numeric,
  match_status          text   -- 'match' | 'mismatch' | 'no_en_manager'
) language sql security invoker stable as $$
  with
  -- Pendientes Cobros (movimientos no pagados)
  cob as (
    select
      c.nombre as cliente_nombre,
      _norm_nombre(c.nombre) as nombre_norm,
      coalesce(sum(m.importe - coalesce(m.importe_cobrado, 0)), 0) as pendiente
    from public.cobros_clientes c
    join public.cobros_movimientos m on m.cliente_id = c.id and not m.pagado
    where c.activo
    group by 1, 2
    having coalesce(sum(m.importe - coalesce(m.importe_cobrado, 0)), 0) > 0
  ),
  -- Pendiente Manager: suma waybills del mes en curso (lo que aún no se ha
  -- cobrado vía la factura agregada de fin de mes)
  mgr as (
    select
      coalesce(contact_name_canon, '(sin contacto)') as cliente_nombre,
      _norm_nombre(coalesce(contact_name_canon, '')) as nombre_norm,
      coalesce(sum(case when subtipo = 'waybill' then total else 0 end), 0) as pendiente_mes
    from public.manager_ventas_efectivas_canon
    where fecha >= date_trunc('month', current_date)
    group by 1, 2
  )
  select
    cob.cliente_nombre,
    cob.pendiente                                                    as pendiente_cobros,
    coalesce(mgr.pendiente_mes, 0)                                   as pendiente_manager_mes,
    (cob.pendiente - coalesce(mgr.pendiente_mes, 0))                 as diferencia,
    case
      when mgr.pendiente_mes is null then 'no_en_manager'
      when abs(cob.pendiente - mgr.pendiente_mes) < 1 then 'match'
      else 'mismatch'
    end as match_status
  from cob
  left join mgr on mgr.nombre_norm = cob.nombre_norm
  order by abs(cob.pendiente - coalesce(mgr.pendiente_mes, 0)) desc;
$$;


-- ---------------------------------------------------------------------------
-- 2) Productos con margen anómalo (últimos N días)
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_productos_anomalos(p_dias int default 30)
returns table(
  product_id   text,
  nombre       text,
  unidades     numeric,
  ventas       numeric,
  margen       numeric,
  margen_pct   numeric,
  motivo       text   -- 'sin_coste' | 'margen_bajo' | 'margen_excesivo'
) language sql security invoker stable as $$
  with agg as (
    select
      product_id,
      coalesce(nullif(trim(nombre), ''), '(sin nombre)') as nombre,
      coalesce(sum(units), 0)        as unidades,
      coalesce(sum(subtotal), 0)     as ventas,
      coalesce(sum(margen_linea), 0) as margen,
      bool_and(coste_unidad is null) as todas_sin_coste
    from public.manager_lineas_efectivas
    where fecha >= current_date - p_dias
    group by 1, 2
    having coalesce(sum(subtotal), 0) > 0
  )
  select
    product_id, nombre, unidades, ventas, margen,
    round((margen / nullif(ventas, 0)) * 100, 1) as margen_pct,
    case
      when todas_sin_coste then 'sin_coste'
      when (margen / nullif(ventas, 0)) * 100 < 5  then 'margen_bajo'
      when (margen / nullif(ventas, 0)) * 100 > 70 then 'margen_excesivo'
      else null
    end as motivo
  from agg
  where todas_sin_coste
     or (margen / nullif(ventas, 0)) * 100 < 5
     or (margen / nullif(ventas, 0)) * 100 > 70
  order by ventas desc
  limit 30;
$$;


-- ---------------------------------------------------------------------------
-- 3) Clientes inactivos (sin pedido vs su cadencia habitual)
--    Cadencia = días promedio entre pedidos en últimos 90d.
--    Inactivo = días desde última compra > cadencia × 1.8 + 3.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_clientes_inactivos()
returns table(
  contact_name_canon text,
  ultima_compra      date,
  dias_sin_pedir     int,
  cadencia_dias      numeric,
  pedidos_90d        int,
  ventas_90d         numeric
) language sql security invoker stable as $$
  with por_cliente as (
    select
      coalesce(contact_name_canon, '(sin contacto)') as contact_name_canon,
      max(fecha)                  as ultima,
      count(distinct id)          as pedidos,
      coalesce(sum(total), 0)     as ventas,
      case when count(distinct fecha) > 1
           then ((max(fecha) - min(fecha))::numeric / nullif(count(distinct fecha) - 1, 0))
           else null end          as cadencia
    from public.manager_ventas_efectivas_canon
    where fecha >= current_date - 90
    group by 1
    having count(distinct id) >= 3        -- al menos 3 pedidos para que cadencia sea fiable
  )
  select
    contact_name_canon,
    ultima                                          as ultima_compra,
    (current_date - ultima)::int                    as dias_sin_pedir,
    round(cadencia, 1)                              as cadencia_dias,
    pedidos::int                                    as pedidos_90d,
    ventas                                          as ventas_90d
  from por_cliente
  where (current_date - ultima) > cadencia * 1.8 + 3
  order by (current_date - ultima) - cadencia desc
  limit 20;
$$;


-- ---------------------------------------------------------------------------
-- 4) Productos con coste subiendo en últimos N días vs media trimestre
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_costes_subiendo(
  p_dias int default 14, p_pct_min numeric default 15
)
returns table(
  product_id    text,
  nombre        text,
  coste_actual  numeric,
  coste_anterior numeric,
  variacion_pct numeric,
  ultima_compra date
) language sql security invoker stable as $$
  with reciente as (
    select product_id,
           max(nombre) as nombre,
           sum(subtotal) / nullif(sum(units), 0) as coste,
           max(fecha) as ult
    from public.manager_lineas
    where tipo = 'COMPRA' and product_id is not null
      and units > 0 and subtotal > 0
      and fecha >= current_date - p_dias
    group by product_id
  ),
  anterior as (
    select product_id,
           sum(subtotal) / nullif(sum(units), 0) as coste
    from public.manager_lineas
    where tipo = 'COMPRA' and product_id is not null
      and units > 0 and subtotal > 0
      and fecha >= current_date - 90
      and fecha < current_date - p_dias
    group by product_id
    having count(*) >= 2
  )
  select
    r.product_id,
    r.nombre,
    r.coste::numeric(12,4) as coste_actual,
    a.coste::numeric(12,4) as coste_anterior,
    round(((r.coste - a.coste) / a.coste) * 100, 1) as variacion_pct,
    r.ult as ultima_compra
  from reciente r
  join anterior a using (product_id)
  where ((r.coste - a.coste) / a.coste) * 100 >= p_pct_min
  order by ((r.coste - a.coste) / a.coste) * 100 desc
  limit 20;
$$;


-- ---------------------------------------------------------------------------
-- 5) KPIs hoy + estado del último sync
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_kpis_hoy()
returns table(
  ventas_hoy        numeric,
  compras_hoy       numeric,
  docs_hoy          int,
  pendiente_mes     numeric,
  ultimo_sync_at    timestamptz,
  ultimo_sync_ok    boolean,
  minutos_desde_sync int
) language sql security invoker stable as $$
  with hoy as (
    select
      coalesce(sum(case when tipo = 'VENTA'  then total else 0 end), 0) as ventas,
      coalesce(sum(case when tipo = 'COMPRA' then total else 0 end), 0) as compras,
      count(*)                                                          as docs
    from public.manager_facturas
    where fecha = current_date
  ),
  pend as (
    select coalesce(sum(case when subtipo = 'waybill' then total else 0 end), 0) as pend
    from public.manager_ventas_efectivas
    where fecha >= date_trunc('month', current_date)
  ),
  sync as (
    select started_at, ok
    from public.manager_holded_sync
    order by started_at desc
    limit 1
  )
  select
    hoy.ventas, hoy.compras, hoy.docs::int,
    pend.pend,
    sync.started_at,
    sync.ok,
    extract(epoch from (now() - sync.started_at))::int / 60 as minutos
  from hoy, pend, sync;
$$;
