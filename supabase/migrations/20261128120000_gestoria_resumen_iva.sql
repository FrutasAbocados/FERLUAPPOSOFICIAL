-- Resumen de IVA por tipo para comparar con el modelo 303 de la gestoría.
-- Mismos documentos que gestoria_documentos: ventas (facturas, tickets y
-- rectificativas tal como están en Holded, sin borradores ni «abuelo») y
-- compras (Holded y compras locales que aún no están en Holded).
-- Las líneas reparten la base por tipo; el redondeo de cada documento se
-- lleva a su tipo principal para que los totales coincidan con las cabeceras.

create or replace function public.gestoria_resumen_iva(p_desde date, p_hasta date)
returns table (
  tipo text,
  iva_pct numeric,
  documentos bigint,
  base numeric,
  cuota numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('admin_full', 'admin_op', 'gestor_gedofu')
  ) then
    raise exception 'sin permiso para consultar datos de gestoría' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or (p_hasta - p_desde) > 366 then
    raise exception 'rango de fechas no válido' using errcode = '22007';
  end if;

  return query
  with docs as (
    select f.id::text as doc, f.tipo, coalesce(f.subtotal, 0) as cab_base, coalesce(f.impuestos, 0) as cab_iva
    from public.manager_facturas f
    where f.fecha between p_desde and p_hasta
      and f.tipo in ('COMPRA', 'VENTA')
      and (f.tipo = 'COMPRA' or f.subtipo in ('invoice', 'salesreceipt', 'creditnote'))
      and coalesce(f.subtipo, '') <> 'abuelo'
      and coalesce(f.raw->>'draft', '') <> 'true'
    union all
    select 'local:' || c.id::text, 'COMPRA', coalesce(c.total_bruto, 0), coalesce(c.total_iva, 0)
    from public.pedidos_wa_compras c
    where c.fecha between p_desde and p_hasta
      and not exists (select 1 from public.manager_facturas f where f.id = c.holded_purchase_id)
  ), lineas as (
    select l.factura_id::text as doc, coalesce(l.tax_rate, 0) as pct, sum(coalesce(l.subtotal, 0)) as b
    from public.manager_lineas l
    where l.factura_id in (select d.doc from docs d where d.doc not like 'local:%')
    group by 1, 2
    union all
    select 'local:' || l.compra_id::text, coalesce(l.iva_pct, 0), sum(coalesce(l.importe, 0))
    from public.pedidos_wa_compras_lineas l
    where 'local:' || l.compra_id::text in (select d.doc from docs d where d.doc like 'local:%')
    group by 1, 2
  ), por_tipo as (
    select d.doc, d.tipo, d.cab_base, d.cab_iva, coalesce(l.pct, 0) as pct,
      round(coalesce(l.b, d.cab_base), 2) as b,
      round(round(coalesce(l.b, d.cab_base), 2) * coalesce(l.pct, 0) / 100, 2) as c,
      row_number() over (partition by d.doc order by abs(coalesce(l.b, 0)) desc, l.pct desc) as rk
    from docs d left join lineas l on l.doc = d.doc
  ), ajustado as (
    select pt.tipo, pt.doc, pt.pct,
      pt.b + case when pt.rk = 1 then pt.cab_base - sum(pt.b) over (partition by pt.doc) else 0 end as b,
      pt.c + case when pt.rk = 1 then pt.cab_iva - sum(pt.c) over (partition by pt.doc) else 0 end as c
    from por_tipo pt
  )
  select a.tipo, a.pct, count(distinct a.doc), round(sum(a.b), 2), round(sum(a.c), 2)
  from ajustado a
  group by a.tipo, a.pct
  order by a.tipo desc, a.pct;
end;
$$;
revoke all on function public.gestoria_resumen_iva(date, date) from public, anon;
grant execute on function public.gestoria_resumen_iva(date, date) to authenticated;
