-- ============================================================================
-- Clientes: acceso para rol operaciones
-- ============================================================================
-- /clientes está habilitado en frontend para admin_full/admin_op/operaciones.
-- La RPC manager_clientes_lista quedó protegida solo con is_admin(), por lo que
-- Adrián (operaciones) veía error al cargar BBDD Clientes.
--
-- Alcance: solo módulo Clientes. No cambia permisos generales de Manager/Cobros.
-- ============================================================================

drop function if exists public.manager_clientes_lista(date, date);

create function public.manager_clientes_lista(p_from date, p_to date)
returns table(
  contact_name_canon  text,
  contact_ids         text[],
  docs                bigint,
  ventas              numeric,
  ventas_subtotal     numeric,
  cogs                numeric,
  margen              numeric,
  margen_pct          numeric,
  pendiente_cobro     numeric,
  ultima_compra       date,
  num_aliases         int
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not (public.is_admin() or public.es_operaciones()) then
    raise exception 'solo admin u operaciones puede consultar clientes manager' using errcode = '42501';
  end if;

  return query
  with cab as (
    select
      coalesce(e.contact_name_canon, '(sin contacto)') as contact_name_canon,
      array_agg(distinct e.contact_id) filter (where e.contact_id is not null) as contact_ids,
      count(distinct e.id)                                                       as docs,
      coalesce(sum(e.total), 0)                                                  as ventas,
      coalesce(sum(case when e.subtipo = 'waybill' then e.total else 0 end), 0) as pendiente,
      max(e.fecha)                                                               as ultima_compra,
      count(distinct e.contact_name)                                             as num_alias
    from public.manager_ventas_efectivas_canon e
    where e.fecha between p_from and p_to
    group by 1
  ),
  lin as (
    select
      coalesce(l.contact_name_canon, '(sin contacto)') as contact_name_canon,
      coalesce(sum(l.subtotal), 0)     as ventas_subtotal,
      coalesce(sum(l.cogs_linea), 0)   as cogs,
      coalesce(sum(l.margen_linea), 0) as margen
    from public.manager_lineas_efectivas l
    where l.fecha between p_from and p_to
    group by 1
  )
  select
    cab.contact_name_canon,
    cab.contact_ids,
    cab.docs,
    cab.ventas,
    coalesce(lin.ventas_subtotal, 0) as ventas_subtotal,
    coalesce(lin.cogs, 0)            as cogs,
    coalesce(lin.margen, 0)          as margen,
    case when coalesce(lin.ventas_subtotal, 0) > 0
         then round((lin.margen / lin.ventas_subtotal) * 100, 1)
         else null end               as margen_pct,
    cab.pendiente                    as pendiente_cobro,
    cab.ultima_compra,
    cab.num_alias::int               as num_aliases
  from cab
  left join lin using (contact_name_canon)
  order by cab.ventas desc nulls last;
end;
$$;

grant execute on function public.manager_clientes_lista(date, date) to authenticated;

drop policy if exists "clientes_programa: operaciones rw" on public.clientes_programa;
create policy "clientes_programa: operaciones rw"
  on public.clientes_programa for all
  using (es_operaciones())
  with check (es_operaciones());
