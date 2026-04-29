-- ============================================================================
-- Manager — clientes que pidieron cada día (vista calendario)
-- ============================================================================
-- Para cada fecha del rango, devuelve número de clientes únicos, total
-- ventas y un array de clientes con su importe. Usa la regla auto-albarán.
-- ============================================================================

create or replace function public.manager_clientes_por_dia(p_from date, p_to date)
returns table(
  fecha          date,
  num_clientes   int,
  num_docs       int,
  total          numeric,
  clientes       jsonb       -- [{nombre, total, docs}] ordenado por total desc
) language sql security invoker stable as $$
  with por_cliente_dia as (
    select
      e.fecha,
      coalesce(e.contact_name_canon, '(sin contacto)') as cliente,
      count(distinct e.id) as docs,
      coalesce(sum(e.total), 0) as total_cliente
    from public.manager_ventas_efectivas_canon e
    where e.fecha between p_from and p_to
    group by 1, 2
  ),
  agg as (
    select
      fecha,
      count(*)::int as num_clientes,
      sum(docs)::int as num_docs,
      sum(total_cliente) as total,
      jsonb_agg(
        jsonb_build_object('nombre', cliente, 'total', round(total_cliente, 2), 'docs', docs)
        order by total_cliente desc
      ) as clientes
    from por_cliente_dia
    group by fecha
  )
  select
    d::date,
    coalesce(a.num_clientes, 0) as num_clientes,
    coalesce(a.num_docs, 0)     as num_docs,
    coalesce(a.total, 0)        as total,
    coalesce(a.clientes, '[]'::jsonb) as clientes
  from generate_series(p_from, p_to, '1 day'::interval) d
  left join agg a on a.fecha = d::date
  order by d;
$$;
