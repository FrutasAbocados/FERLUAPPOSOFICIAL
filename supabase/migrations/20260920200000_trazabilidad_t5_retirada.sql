-- T5 · Paso adelante: dado un lote o una factura de compra, a quien fue.
--
-- Es la consulta que hace una inspeccion o una alerta sanitaria, y la que hasta
-- ahora era imposible: la trazabilidad vivia en una cadena de texto que no se
-- podia consultar al reves. Hay que poder contestarla rapido y por escrito.
--
-- Acepta lote, factura de compra o proveedor, en cualquier combinacion. Sin
-- ningun filtro no devuelve nada: un listado completo no es una retirada.
create or replace function public.facturacion_trazabilidad_retirada(
  p_lote        text default null,
  p_num_factura text default null,
  p_proveedor   text default null,
  p_desde       date default null,
  p_hasta       date default null
)
returns table (
  traza_id          uuid,
  lote              text,
  origen            text,
  proveedor_nombre  text,
  num_factura       text,
  fecha_compra      date,
  descripcion_compra text,
  cliente_id        uuid,
  cliente_nombre    text,
  cliente_comercial text,
  borrador_id       uuid,
  numero_interno    bigint,
  fecha_operacion   date,
  descripcion_venta text,
  cantidad_vendida  numeric,
  unidad_venta      text,
  alcance           text,
  cantidad_imputada numeric,
  unidad_imputada   text,
  confianza         text,
  metodo            text,
  revision_cerrada  boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    t.id,
    t.lote,
    t.origen,
    t.proveedor_nombre,
    t.num_factura,
    t.fecha_compra,
    t.descripcion_compra,
    b.cliente_id,
    fc.nombre_fiscal,
    fc.nombre_comercial,
    b.id,
    b.numero_interno,
    b.fecha_operacion,
    l.descripcion,
    l.cantidad,
    l.unidad,
    t.alcance,
    t.cantidad_imputada,
    t.unidad,
    t.confianza,
    t.metodo,
    coalesce((
      select e.accion = 'cerrado'
      from public.facturacion_revision_sombra_eventos e
      where e.borrador_id = b.id
      order by e.secuencia desc
      limit 1
    ), false)
  from public.facturacion_linea_trazas_vigentes t
  join public.facturacion_borrador_lineas l on l.id = t.borrador_linea_id
  join public.facturacion_borradores b on b.id = t.borrador_id
  join public.facturacion_clientes fc on fc.id = b.cliente_id
  where public.is_admin()
    and (p_lote is not null or p_num_factura is not null or p_proveedor is not null)
    and (p_lote is null or t.lote = p_lote)
    and (p_num_factura is null or t.num_factura = p_num_factura)
    and (p_proveedor is null
         or public.manager_norm_nombre(t.proveedor_nombre)
            like '%' || public.manager_norm_nombre(p_proveedor) || '%')
    and (p_desde is null or b.fecha_operacion >= p_desde)
    and (p_hasta is null or b.fecha_operacion <= p_hasta)
  order by b.fecha_operacion desc, fc.nombre_fiscal, l.orden;
$fn$;

revoke execute on function public.facturacion_trazabilidad_retirada(text, text, text, date, date)
  from public, anon;
grant execute on function public.facturacion_trazabilidad_retirada(text, text, text, date, date)
  to authenticated, service_role;

-- Lotes con venta trazada, para ofrecer el buscador sin escribir a ciegas.
create or replace view public.facturacion_trazabilidad_lotes
with (security_invoker = on)
as
select
  t.lote,
  t.proveedor_nombre,
  t.num_factura,
  min(t.fecha_compra)               as fecha_compra,
  count(distinct t.borrador_id)::integer as documentos,
  count(*)::integer                 as lineas_venta,
  max(b.fecha_operacion)            as ultima_venta
from public.facturacion_linea_trazas_vigentes t
join public.facturacion_borradores b on b.id = t.borrador_id
where t.lote is not null
group by t.lote, t.proveedor_nombre, t.num_factura;

alter view public.facturacion_trazabilidad_lotes owner to postgres;
revoke all on public.facturacion_trazabilidad_lotes from anon;
grant select on public.facturacion_trazabilidad_lotes to authenticated, service_role;
