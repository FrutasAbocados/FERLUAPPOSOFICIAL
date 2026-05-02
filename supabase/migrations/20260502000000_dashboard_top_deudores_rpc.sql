-- ============================================================================
-- RPC dashboard_top_deudores() — agrega deuda por cliente en servidor
-- ============================================================================
-- Antes: el hook useTopDeudoresCobros traía todas las filas de
-- cobros_movimientos con pagado=false + join a clientes y agregaba en JS.
-- Hoy son cientos pero crece sin tope. Esta RPC hace la agregación en
-- Postgres y devuelve solo las filas con pendiente > 0, ordenadas por
-- pendiente desc. Ahorra payload y CPU del cliente.
-- ============================================================================

create or replace function public.dashboard_top_deudores()
returns table (
  cliente_id  uuid,
  nombre      text,
  pendiente   numeric,
  movimientos integer,
  vencido     numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with mov as (
    select m.cliente_id,
           c.nombre,
           coalesce(m.importe, 0) - coalesce(m.importe_cobrado, 0) as pend,
           m.fecha_vencimiento
    from public.cobros_movimientos m
    join public.cobros_clientes c on c.id = m.cliente_id
    where m.pagado = false
      and c.activo = true
  )
  select cliente_id,
         max(nombre)                                                  as nombre,
         sum(pend)::numeric                                           as pendiente,
         count(*)::int                                                as movimientos,
         sum(case when fecha_vencimiento < current_date then pend else 0 end)::numeric as vencido
  from mov
  group by cliente_id
  having sum(pend) > 0
  order by sum(pend) desc;
$$;

grant execute on function public.dashboard_top_deudores() to authenticated;
