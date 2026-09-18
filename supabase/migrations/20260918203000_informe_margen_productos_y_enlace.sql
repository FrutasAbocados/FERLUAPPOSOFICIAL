-- ============================================================================
-- Informe diario de margen: detalle por producto + enlace corto
-- ============================================================================
-- - informe_margen_diario(fecha) añade `lineas` (productos) en cada factura y
--   `productos_dia` (agregado por nombre normalizado, regla Manager).
-- - informe_margen_links: token corto -> PDF. La función pública
--   `informe-margen-pdf` firma al vuelo y redirige; caduca a los 7 días.
-- - informe_margen_envios guarda la respuesta del proveedor para diagnóstico.
-- ============================================================================

alter table public.informe_margen_envios
  add column if not exists respuesta_proveedor text;

create table if not exists public.informe_margen_links (
  token        text primary key check (token ~ '^[A-Za-z0-9]{12,32}$'),
  storage_path text not null,
  expira_at    timestamptz not null,
  created_at   timestamptz not null default now()
);

alter table public.informe_margen_links enable row level security;
-- Sin policies: solo service_role (edge) accede.

create or replace function public.informe_margen_diario(p_fecha date)
returns jsonb
language sql
security invoker
stable
as $$
  with lineas as (
    select
      l.factura_id,
      l.id as linea_id,
      l.subtipo,
      l.fecha,
      coalesce(nullif(l.contact_name_canon, ''), nullif(l.contact_name_raw, ''), '(sin cliente)') as cliente,
      upper(regexp_replace(trim(coalesce(nullif(l.nombre, ''), l.descripcion, '(sin nombre)')), '\s+', ' ', 'g')) as producto,
      coalesce(l.units, 0)               as unidades,
      coalesce(l.subtotal, 0)            as subtotal,
      l.coste_unidad,
      coalesce(l.margen_linea, 0)        as margen,
      coalesce(l.subtotal_con_coste, 0)  as base_coste,
      (l.coste_unidad is null or coalesce(l.subtotal_con_coste, 0) < coalesce(l.subtotal, 0)) as pendiente
    from public.manager_lineas_efectivas l
    where l.tipo = 'VENTA'
      and l.subtipo in ('invoice', 'salesreceipt', 'waybill')
      and l.fecha between date_trunc('month', p_fecha)::date and p_fecha
  ),
  docs as (
    select
      l.factura_id,
      f.doc_number,
      l.subtipo,
      l.cliente,
      sum(l.subtotal)   as ventas,
      sum(l.margen)     as margen,
      sum(l.base_coste) as base_coste,
      count(*)          as lineas,
      count(*) filter (where l.pendiente) as lineas_pendientes,
      jsonb_agg(jsonb_build_object(
        'producto', l.producto,
        'unidades', round(l.unidades, 3),
        'precio', case when l.unidades <> 0 then round(l.subtotal / l.unidades, 3) end,
        'coste_unidad', round(l.coste_unidad, 3),
        'ventas', round(l.subtotal, 2),
        'margen', round(l.margen, 2),
        'base_coste', round(l.base_coste, 2),
        'pendiente', l.pendiente
      ) order by l.subtotal desc) as detalle
    from lineas l
    left join public.manager_facturas f on f.id = l.factura_id
    where l.fecha = p_fecha
    group by l.factura_id, f.doc_number, l.subtipo, l.cliente
  ),
  productos as (
    select
      l.producto,
      count(distinct l.factura_id) as documentos,
      sum(l.unidades)   as unidades,
      sum(l.subtotal)   as ventas,
      sum(l.margen)     as margen,
      sum(l.base_coste) as base_coste,
      count(*) filter (where l.pendiente) as lineas_pendientes
    from lineas l
    where l.fecha = p_fecha
    group by l.producto
  ),
  mes as (
    select
      l.cliente,
      count(distinct l.factura_id) as documentos,
      sum(l.subtotal)   as ventas,
      sum(l.margen)     as margen,
      sum(l.base_coste) as base_coste,
      sum(l.subtotal)   filter (where l.fecha = p_fecha) as ventas_dia,
      count(*) filter (where l.pendiente) as lineas_pendientes
    from lineas l
    group by l.cliente
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'mes_desde', date_trunc('month', p_fecha)::date,
    'dia', (
      select jsonb_build_object(
        'documentos', count(*),
        'ventas', round(coalesce(sum(ventas), 0), 2),
        'margen', round(coalesce(sum(margen), 0), 2),
        'base_coste', round(coalesce(sum(base_coste), 0), 2),
        'lineas_pendientes', coalesce(sum(lineas_pendientes), 0)
      ) from docs
    ),
    'mes_total', (
      select jsonb_build_object(
        'documentos', coalesce(sum(documentos), 0),
        'ventas', round(coalesce(sum(ventas), 0), 2),
        'margen', round(coalesce(sum(margen), 0), 2),
        'base_coste', round(coalesce(sum(base_coste), 0), 2)
      ) from mes
    ),
    'facturas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'doc_number', coalesce(doc_number, factura_id),
        'subtipo', subtipo,
        'cliente', cliente,
        'ventas', round(ventas, 2),
        'margen', round(margen, 2),
        'base_coste', round(base_coste, 2),
        'lineas', lineas,
        'lineas_pendientes', lineas_pendientes,
        'detalle', detalle
      ) order by cliente, doc_number)
      from docs
    ), '[]'::jsonb),
    'productos_dia', coalesce((
      select jsonb_agg(jsonb_build_object(
        'producto', producto,
        'documentos', documentos,
        'unidades', round(unidades, 3),
        'ventas', round(ventas, 2),
        'margen', round(margen, 2),
        'base_coste', round(base_coste, 2),
        'lineas_pendientes', lineas_pendientes
      ) order by ventas desc)
      from productos
    ), '[]'::jsonb),
    'clientes_mes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cliente', cliente,
        'documentos', documentos,
        'ventas', round(ventas, 2),
        'margen', round(margen, 2),
        'base_coste', round(base_coste, 2),
        'ventas_dia', round(coalesce(ventas_dia, 0), 2),
        'lineas_pendientes', lineas_pendientes
      ) order by ventas desc)
      from mes
    ), '[]'::jsonb)
  )
$$;
