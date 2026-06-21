-- Asesor IA: limitar payload (top 15 líneas/cliente por venta, clientes con
-- venta >= 20 €) para que la generación con la IA no exceda el timeout.
create or replace function public.manager_asesor_ia_payload(p_fecha date)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with dia as (
    select contact_name_canon as cliente, nombre,
      sum(units)                                                          as uds,
      round(sum(subtotal)::numeric, 2)                                    as venta,
      round(sum(cogs_linea)::numeric, 2)                                  as coste,
      round((sum(subtotal) / nullif(sum(units), 0))::numeric, 3)          as pvp_dia,
      round(avg(coste_unidad)::numeric, 3)                                as coste_unit,
      round(((sum(subtotal) - sum(cogs_linea)) / nullif(sum(subtotal), 0) * 100)::numeric, 1) as margen_pct
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
$$;

revoke all on function public.manager_asesor_ia_payload(date) from public, anon, authenticated;
grant execute on function public.manager_asesor_ia_payload(date) to service_role;
