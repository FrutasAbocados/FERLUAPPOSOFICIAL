-- Manager · Asesor IA comercial por día
-- ----------------------------------------------------------------------------
-- Analiza las facturas de VENTA de un día, cliente por cliente, comparando el
-- PVP del día con (a) el histórico de ese mismo cliente, (b) el mercado (resto
-- de clientes) y (c) el coste real, para detectar oportunidades de coste/PVP.
--
-- 1) manager_asesor_ia_payload(fecha)  -> jsonb con todos los datos (service_role)
-- 2) tabla manager_asesor_ia          -> resultado generado por la IA (1 por día)
-- 3) manager_asesor_ia_get(fecha)     -> lectura para el front (admin only)
-- ----------------------------------------------------------------------------

-- 1) Payload de datos -------------------------------------------------------
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
      round((sum(subtotal) / nullif(sum(units), 0))::numeric, 3) as pvp_cli_90d,
      round(sum(subtotal)::numeric, 0)                           as venta_cli_90d
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
  lineas as (
    select d.cliente,
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
      d.venta as venta_ord
    from dia d
    left join hist_cli h using (cliente, nombre)
    left join mercado  m using (nombre)
  ),
  clientes as (
    select cliente,
      round(sum((linea->>'venta')::numeric), 2) as venta_cli,
      jsonb_agg(linea order by venta_ord desc)   as lineas
    from lineas
    group by cliente
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

-- 2) Tabla resultado --------------------------------------------------------
create table if not exists public.manager_asesor_ia (
  fecha         date primary key,
  contenido_md  text,
  datos         jsonb,
  resumen       text,
  oportunidad_eur numeric,
  modelo        text,
  tokens_in     integer,
  tokens_out    integer,
  created_at    timestamptz not null default now(),
  created_by    uuid
);

alter table public.manager_asesor_ia enable row level security;

drop policy if exists "manager_asesor_ia: admin rw" on public.manager_asesor_ia;
create policy "manager_asesor_ia: admin rw" on public.manager_asesor_ia
  for all using (is_admin()) with check (is_admin());

-- 3) Getter para el front ---------------------------------------------------
create or replace function public.manager_asesor_ia_get(p_fecha date)
returns public.manager_asesor_ia
language sql
security invoker
stable
as $$
  select * from public.manager_asesor_ia where fecha = p_fecha and is_admin();
$$;

grant execute on function public.manager_asesor_ia_get(date) to authenticated;
