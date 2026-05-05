-- RPC detalle de pagos de fijos en rango — base para Stats Gastos
drop function if exists public.gastos_fijos_pagos_detalle(date, date);
create or replace function public.gastos_fijos_pagos_detalle(p_from date, p_to date)
returns table (
  fijo_id           uuid,
  fijo_nombre       text,
  pagado_at         timestamptz,
  anio              int,
  mes               int,
  total             numeric,
  categoria_id      uuid,
  categoria_nombre  text,
  categoria_color   text,
  proveedor         text,
  proveedor_clave   text
)
language sql security invoker stable as $$
  select
    p.fijo_id,
    g.nombre as fijo_nombre,
    p.pagado_at,
    p.anio, p.mes,
    coalesce(p.importe_real, round(g.importe*(1+g.iva_pct/100),2))::numeric as total,
    g.categoria_id, c.nombre as categoria_nombre, c.color as categoria_color,
    coalesce(mc.nombre, gpm.nombre, '—') as proveedor,
    coalesce(g.proveedor_holded_id, g.proveedor_manual_id::text, '_sin') as proveedor_clave
  from public.gastos_fijos_pagos p
  join public.gastos_fijos g on g.id = p.fijo_id
  left join public.gastos_categorias c on c.id = g.categoria_id
  left join public.manager_contactos mc on mc.id = g.proveedor_holded_id
  left join public.gastos_proveedores_manuales gpm on gpm.id = g.proveedor_manual_id
  where p.pagado_at is not null
    and make_date(p.anio, p.mes, 1) between date_trunc('month', p_from)::date
                                         and date_trunc('month', p_to)::date;
$$;

grant execute on function public.gastos_fijos_pagos_detalle(date, date) to authenticated;
