-- Optimizar Manager > Productos despues de resolver compras sin product_id.
--
-- manager_productos_lista no necesita volver a resolver las 52k lineas: el
-- refresco horario de manager_coste_alias_calc ya conoce el producto y el coste.
-- Guardamos tambien la ultima fecha y la reutilizamos en la lista.

alter table public.manager_coste_alias_calc
  add column if not exists ultima_compra date;

create or replace function public.manager_refresh_coste_alias()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  truncate manager_coste_alias_calc;

  insert into manager_coste_alias_calc(product_id, coste_eur, n_compras, ultima_compra)
  with lineas as (
    select l.subtotal, l.units, f.fecha, lower(trim(l.nombre)) as nom
    from manager_lineas l
    join manager_facturas f on f.id = l.factura_id
    where f.tipo = 'COMPRA'
      and l.product_id is null
      and f.fecha >= current_date - 45
      and l.subtotal > 0
      and l.units > 0
  ),
  m as (
    select
      li.fecha,
      li.subtotal,
      a.holded_product_id as pid,
      a.coste_fijo,
      li.units * a.factor_unidad as kg_eq
    from lineas li
    cross join lateral (
      select a.*
      from manager_compra_alias a
      where a.activo
        and a.holded_product_id is not null
        and (
          a.nombre_compra_norm = li.nom
          or manager_norm_nombre(a.nombre_compra_norm) = manager_norm_nombre(li.nom)
        )
      order by (a.nombre_compra_norm = li.nom) desc, a.nombre_compra_norm
      limit 1
    ) a
    where a.factor_unidad > 0
  ),
  raw as (
    select *, dense_rank() over (partition by pid order by fecha desc) as rk
    from m
  ),
  agg as (
    select
      pid,
      max(coste_fijo) as coste_fijo,
      max(fecha) as ultima_compra,
      count(distinct fecha) as n_fechas,
      sum(subtotal) filter (where rk <= 3) as s3,
      sum(kg_eq) filter (where rk <= 3) as k3,
      sum(subtotal) filter (where fecha >= current_date - 7) as s7,
      sum(kg_eq) filter (where fecha >= current_date - 7) as k7,
      sum(subtotal) filter (where fecha >= current_date - 21) as s21,
      sum(kg_eq) filter (where fecha >= current_date - 21) as k21,
      sum(subtotal) as s45,
      sum(kg_eq) as k45,
      count(*) as n
    from raw
    group by pid
  ),
  calc as (
    select
      pid,
      n,
      ultima_compra,
      coalesce(
        coste_fijo,
        case
          when n_fechas >= 3 and k3 > 0 then s3 / k3
          when k7 > 0 then s7 / k7
          when k21 > 0 then s21 / k21
          else s45 / nullif(k45, 0)
        end
      ) as coste
    from agg
  )
  select pid, coste::numeric(12,4), n, ultima_compra
  from calc
  where coste is not null and coste > 0;

  perform public.manager_refresh_coste_nombre_auto();
end;
$function$;

create or replace function public.manager_productos_lista(p_from date, p_to date)
returns table(
  product_id      text,
  nombre          text,
  veces           bigint,
  unidades        numeric,
  ventas          numeric,
  ventas_subtotal numeric,
  cogs            numeric,
  margen          numeric,
  margen_pct      numeric,
  coste_unidad    numeric,
  es_coste_manual boolean,
  ultima_compra   date,
  ultima_venta    date
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with agg as (
    select
      max(l.product_id) as product_id_original,
      coalesce(nullif(trim(l.nombre), ''), '(sin nombre)') as nombre,
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
    group by coalesce(nullif(trim(l.nombre), ''), '(sin nombre)')
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
    coalesce(cac.ultima_compra, pc.ultima_compra) as ultima_compra,
    p.ultima_venta
  from productos p
  left join public.manager_costes_manuales_nombre mcn
    on mcn.nombre_norm = lower(trim(p.nombre))
  left join public.manager_producto_coste pc on pc.product_id = p.pid
  left join public.manager_coste_alias_calc cac on cac.product_id = p.pid
  left join public.manager_coste_producto_calc cpc on cpc.product_id = p.pid
  left join public.manager_coste_nombre_calc cnc on cnc.nombre_norm = lower(trim(p.nombre))
  order by p.ventas_subtotal desc nulls last;
$function$;

select public.manager_refresh_coste_alias();
