-- Conservación y acceso seguro a documentos originales de compras.
-- Los PDFs/fotos nuevos se guardan en un bucket privado. El gestor Gedofu
-- puede leerlos, pero no subir, editar ni borrar objetos.

alter table public.pedidos_wa_compras
  add column if not exists pdf_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gestoria-documentos',
  'gestoria-documentos',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "gestoria-documentos: admin rw" on storage.objects;
create policy "gestoria-documentos: admin rw"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'gestoria-documentos' and public.is_admin())
  with check (bucket_id = 'gestoria-documentos' and public.is_admin());

drop policy if exists "gestoria-documentos: gestor read" on storage.objects;
create policy "gestoria-documentos: gestor read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'gestoria-documentos' and public.es_gestor_gedofu());

drop function if exists public.gestoria_documentos(date, date, text);

create function public.gestoria_documentos(
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
      coalesce(archivo.foto_paths, '{}'::text[]) as foto_paths
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
      coalesce(c.foto_paths, '{}'::text[]) as foto_paths
    from public.pedidos_wa_compras c
    where c.fecha between p_desde and p_hasta
      and p_tipo in ('AMBAS', 'COMPRA')
      and not exists (
        select 1
        from public.manager_facturas f
        where f.id = c.holded_purchase_id
      )
  )
  select d.*
  from documentos d
  order by d.fecha desc, d.numero desc;
end;
$$;

drop function if exists public.gestoria_lineas(date, date, text);

create function public.gestoria_lineas(
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
      coalesce(f.total, 0) as total_documento
    from public.manager_facturas f
    join public.manager_lineas l
      on l.factura_id = f.id
    left join public.manager_clientes_alias a
      on a.alias_from = f.contact_name
    where f.fecha between p_desde and p_hasta
      and f.tipo in ('COMPRA', 'VENTA')
      and (p_tipo = 'AMBAS' or f.tipo = p_tipo)

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
      coalesce(c.total, 0) as total_documento
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
  select l.*
  from lineas l
  order by l.fecha desc, l.numero desc;
end;
$$;

revoke all on function public.gestoria_documentos(date, date, text) from public;
revoke all on function public.gestoria_lineas(date, date, text) from public;
revoke execute on function public.gestoria_documentos(date, date, text) from anon;
revoke execute on function public.gestoria_lineas(date, date, text) from anon;
grant execute on function public.gestoria_documentos(date, date, text) to authenticated;
grant execute on function public.gestoria_lineas(date, date, text) to authenticated;
