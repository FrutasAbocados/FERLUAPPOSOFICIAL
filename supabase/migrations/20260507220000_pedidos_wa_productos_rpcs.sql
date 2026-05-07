-- RPCs de soporte para la UI de mapeo productos WA ↔ Holded.

-- 1) Resumen de productos WA con su mapeo actual a Holded.
create or replace function public.pedidos_wa_productos_resumen()
returns table (
  producto_normalizado text,
  primer_uso           text,
  veces_usado          int,
  holded_product_id    text,
  holded_product_name  text,
  source               text
)
language sql stable
as $$
  with productos as (
    select
      lower(trim(producto_normalizado)) as nom,
      min(producto_normalizado)         as primer_uso,
      count(*)::int                     as veces_usado
    from public.pedidos_wa_lineas
    where producto_normalizado is not null and producto_normalizado <> ''
    group by lower(trim(producto_normalizado))
  )
  select
    p.nom                  as producto_normalizado,
    p.primer_uso,
    p.veces_usado,
    ph.holded_product_id,
    ph.holded_product_name,
    ph.source
  from productos p
  left join public.pedidos_wa_productos_holded ph
    on ph.producto_normalizado = p.nom
  order by (ph.holded_product_id is null) desc, p.nom;
$$;

grant execute on function public.pedidos_wa_productos_resumen() to authenticated;

-- 2) Buscar productos en el catálogo Holded (desde manager_lineas, que tiene el product_id).
create or replace function public.pedidos_wa_buscar_productos_holded(
  p_query text,
  p_limit int default 20
)
returns table (
  product_id  text,
  nombre      text,
  veces_visto int
)
language sql stable
as $$
  select
    product_id,
    min(nombre) as nombre,
    count(*)::int as veces_visto
  from public.manager_lineas
  where product_id is not null
    and tipo = 'VENTA'
    and lower(nombre) like '%' || lower(coalesce(p_query, '')) || '%'
  group by product_id
  order by count(*) desc, min(nombre)
  limit greatest(1, least(p_limit, 50));
$$;

grant execute on function public.pedidos_wa_buscar_productos_holded(text, int) to authenticated;
