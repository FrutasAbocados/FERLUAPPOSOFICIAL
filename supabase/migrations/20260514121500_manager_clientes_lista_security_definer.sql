-- ============================================================================
-- Clientes BBDD: evitar timeout por RLS en vistas analiticas
-- ============================================================================
-- La RPC se ejecuta desde PostgREST como usuario autenticado. Las vistas
-- manager_ventas_efectivas_canon/manager_lineas_efectivas usan security_invoker
-- y aplican RLS fila a fila sobre tablas grandes, provocando statement timeout.
--
-- Mantenemos el acceso solo para admin_full/admin_op con is_admin(), pero la
-- consulta interna corre como owner para no pagar ese coste de RLS por fila.
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
  if not public.is_admin() then
    raise exception 'solo admin puede consultar clientes manager' using errcode = '42501';
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
