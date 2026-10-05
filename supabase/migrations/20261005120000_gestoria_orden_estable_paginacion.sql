-- Gestoría pagina sus RPC con .range() porque PostgREST corta cada respuesta
-- en 1.000 filas. Con fecha + número había empates (El Abuelo y compras sin
-- número) y una página podía repetir o saltarse filas: se añade una clave única
-- como último criterio de orden. La firma y las columnas devueltas no cambian.

create or replace function public.gestoria_documentos(
  p_desde date,
  p_hasta date,
  p_tipo text default 'AMBAS'
)
returns table (
  tipo text,
  subtipo text,
  fecha date,
  numero text,
  tercero text,
  base_imponible numeric,
  iva numeric,
  total numeric,
  pendiente numeric,
  pdf_path text,
  foto_paths text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('admin_full', 'admin_op', 'gestor_gedofu')
  ) then
    raise exception 'sin permiso para consultar datos de gestoría'
      using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'rango de fechas no válido'
      using errcode = '22007';
  end if;

  if (p_hasta - p_desde) > 366 then
    raise exception 'el rango máximo permitido es de 366 días'
      using errcode = '22023';
  end if;

  if p_tipo not in ('AMBAS', 'COMPRA', 'VENTA') then
    raise exception 'tipo contable no válido'
      using errcode = '22023';
  end if;

  return query
  with documentos as (
    select
      f.tipo,
      coalesce(f.subtipo, '') as subtipo,
      f.fecha,
      coalesce(f.doc_number, '') as numero,
      coalesce(a.alias_to, f.contact_name, 'Sin tercero') as tercero,
      coalesce(f.subtotal, 0) as base_imponible,
      coalesce(f.impuestos, 0) as iva,
      coalesce(f.total, 0) as total,
      coalesce(f.payments_pending, 0) as pendiente,
      archivo.pdf_path,
      coalesce(archivo.foto_paths, '{}'::text[]) as foto_paths,
      f.id::text as clave
    from public.manager_facturas f
    left join public.manager_clientes_alias a
      on a.alias_from = f.contact_name
    left join lateral (
      select c.pdf_path, c.foto_paths
      from public.pedidos_wa_compras c
      where c.holded_purchase_id = f.id
      order by c.created_at desc
      limit 1
    ) archivo on true
    where f.fecha between p_desde and p_hasta
      and f.tipo in ('COMPRA', 'VENTA')
      and (p_tipo = 'AMBAS' or f.tipo = p_tipo)
      and (f.tipo = 'COMPRA' or f.subtipo in ('invoice', 'salesreceipt'))
      and coalesce(f.subtipo, '') <> 'abuelo'

    union all

    select
      'COMPRA'::text as tipo,
      coalesce(c.origen::text, 'archivo_local') as subtipo,
      c.fecha,
      coalesce(c.num_factura, '') as numero,
      coalesce(c.proveedor_nombre, 'Sin proveedor') as tercero,
      coalesce(c.total_bruto, 0) as base_imponible,
      coalesce(c.total_iva, 0) as iva,
      coalesce(c.total, 0) as total,
      0::numeric as pendiente,
      c.pdf_path,
      coalesce(c.foto_paths, '{}'::text[]) as foto_paths,
      'local:' || c.id::text as clave
    from public.pedidos_wa_compras c
    where c.fecha between p_desde and p_hasta
      and p_tipo in ('AMBAS', 'COMPRA')
      and not exists (
        select 1
        from public.manager_facturas f
        where f.id = c.holded_purchase_id
      )
  )
  select d.tipo, d.subtipo, d.fecha, d.numero, d.tercero, d.base_imponible,
         d.iva, d.total, d.pendiente, d.pdf_path, d.foto_paths
  from documentos d
  order by d.fecha desc, d.numero desc, d.clave;
end;
$$;

create or replace function public.gestoria_lineas(
  p_desde date,
  p_hasta date,
  p_tipo text default 'AMBAS'
)
returns table (
  tipo text,
  subtipo text,
  fecha date,
  numero text,
  tercero text,
  descripcion text,
  sku text,
  cantidad numeric,
  precio_unitario numeric,
  iva_pct numeric,
  importe numeric,
  total_documento numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('admin_full', 'admin_op', 'gestor_gedofu')
  ) then
    raise exception 'sin permiso para consultar datos de gestoría'
      using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'rango de fechas no válido'
      using errcode = '22007';
  end if;

  if (p_hasta - p_desde) > 366 then
    raise exception 'el rango máximo permitido es de 366 días'
      using errcode = '22023';
  end if;

  if p_tipo not in ('AMBAS', 'COMPRA', 'VENTA') then
    raise exception 'tipo contable no válido'
      using errcode = '22023';
  end if;

  return query
  with lineas as (
    select
      f.tipo,
      coalesce(f.subtipo, '') as subtipo,
      f.fecha,
      coalesce(f.doc_number, '') as numero,
      coalesce(a.alias_to, f.contact_name, 'Sin tercero') as tercero,
      coalesce(l.descripcion, l.nombre, 'Sin descripción') as descripcion,
      coalesce(l.sku, '') as sku,
      coalesce(l.units, 0) as cantidad,
      case
        when coalesce(l.units, 0) <> 0 then coalesce(l.subtotal, 0) / l.units
        else coalesce(l.price, 0)
      end as precio_unitario,
      coalesce(l.tax_rate, 0) as iva_pct,
      coalesce(l.subtotal, 0) as importe,
      coalesce(f.total, 0) as total_documento,
      f.id::text || ':' || l.id::text as clave
    from public.manager_facturas f
    join public.manager_lineas l
      on l.factura_id = f.id
    left join public.manager_clientes_alias a
      on a.alias_from = f.contact_name
    where f.fecha between p_desde and p_hasta
      and f.tipo in ('COMPRA', 'VENTA')
      and (p_tipo = 'AMBAS' or f.tipo = p_tipo)
      and (f.tipo = 'COMPRA' or f.subtipo in ('invoice', 'salesreceipt'))
      and coalesce(f.subtipo, '') <> 'abuelo'

    union all

    select
      'COMPRA'::text as tipo,
      coalesce(c.origen::text, 'archivo_local') as subtipo,
      c.fecha,
      coalesce(c.num_factura, '') as numero,
      coalesce(c.proveedor_nombre, 'Sin proveedor') as tercero,
      coalesce(l.descripcion, 'Sin descripción') as descripcion,
      coalesce(l.codigo_proveedor, '') as sku,
      coalesce(l.cantidad, 0) as cantidad,
      coalesce(l.precio_unitario, 0) as precio_unitario,
      coalesce(l.iva_pct, 0) as iva_pct,
      coalesce(l.importe, 0) as importe,
      coalesce(c.total, 0) as total_documento,
      'local:' || c.id::text || ':' || l.id::text as clave
    from public.pedidos_wa_compras c
    join public.pedidos_wa_compras_lineas l
      on l.compra_id = c.id
    where c.fecha between p_desde and p_hasta
      and p_tipo in ('AMBAS', 'COMPRA')
      and not exists (
        select 1
        from public.manager_facturas f
        where f.id = c.holded_purchase_id
      )
  )
  select l.tipo, l.subtipo, l.fecha, l.numero, l.tercero, l.descripcion, l.sku,
         l.cantidad, l.precio_unitario, l.iva_pct, l.importe, l.total_documento
  from lineas l
  order by l.fecha desc, l.numero desc, l.clave;
end;
$$;
