-- Corrige la guardia de autorización de las RPC de gestoría.
-- is_admin() devuelve NULL cuando auth.uid() no tiene perfil; una comprobación
-- EXISTS directa evita la lógica ternaria y deniega siempre por defecto.

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
  pendiente numeric
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
  select
    f.tipo,
    coalesce(f.subtipo, '') as subtipo,
    f.fecha,
    coalesce(f.doc_number, '') as numero,
    coalesce(a.alias_to, f.contact_name, 'Sin tercero') as tercero,
    coalesce(f.subtotal, 0) as base_imponible,
    coalesce(f.impuestos, 0) as iva,
    coalesce(f.total, 0) as total,
    coalesce(f.payments_pending, 0) as pendiente
  from public.manager_facturas f
  left join public.manager_clientes_alias a
    on a.alias_from = f.contact_name
  where f.fecha between p_desde and p_hasta
    and f.tipo in ('COMPRA', 'VENTA')
    and (p_tipo = 'AMBAS' or f.tipo = p_tipo)
  order by f.fecha desc, f.doc_number desc;
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
  select
    f.tipo,
    coalesce(f.subtipo, '') as subtipo,
    f.fecha,
    coalesce(f.doc_number, '') as numero,
    coalesce(a.alias_to, f.contact_name, 'Sin tercero') as tercero,
    coalesce(l.descripcion, l.nombre, 'Sin descripción') as descripcion,
    coalesce(l.sku, '') as sku,
    coalesce(l.units, 0) as cantidad,
    coalesce(l.price, 0) as precio_unitario,
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
  order by f.fecha desc, f.doc_number desc, l.id;
end;
$$;

revoke all on function public.gestoria_documentos(date, date, text) from public;
revoke all on function public.gestoria_lineas(date, date, text) from public;
revoke execute on function public.gestoria_documentos(date, date, text) from anon;
revoke execute on function public.gestoria_lineas(date, date, text) from anon;
grant execute on function public.gestoria_documentos(date, date, text) to authenticated;
grant execute on function public.gestoria_lineas(date, date, text) to authenticated;
