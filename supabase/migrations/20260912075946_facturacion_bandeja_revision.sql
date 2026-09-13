-- ============================================================================
-- Facturacion propia A5: bandeja de revision y recalculo de borradores
-- ============================================================================
-- Sigue siendo modo sombra: estas funciones no emiten, no numeran fiscalmente
-- y no modifican documentos de Holded.
-- ============================================================================

create or replace function public.facturacion_bandeja()
returns table (
  borrador_id uuid,
  numero_interno bigint,
  revision integer,
  estado text,
  motivo_bloqueo text,
  tipo_documento text,
  fecha_operacion date,
  updated_at timestamptz,
  cliente_id uuid,
  cliente_nombre text,
  cliente_comercial text,
  cliente_estado text,
  holded_contact_id text,
  pedido_wa_id uuid,
  pedido_fecha date,
  pedido_cliente_nombre text,
  holded_documento_id text,
  holded_documento_numero text,
  holded_documento_tipo text,
  holded_estado text,
  holded_actualizado_at timestamptz,
  lineas bigint,
  lineas_pendientes bigint,
  base_provisional numeric,
  iva_provisional numeric,
  recargo_provisional numeric,
  total_provisional numeric,
  holded_lineas bigint,
  holded_subtotal numeric,
  holded_total numeric,
  diferencia_holded numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with propios as (
    select
      b.id as borrador_id,
      count(l.id) as lineas,
      count(l.id) filter (where l.precio_estado = 'pendiente') as lineas_pendientes,
      round(coalesce(sum(l.base_provisional), 0), 2) as base_provisional,
      round(coalesce(sum(l.cuota_iva_provisional), 0), 2) as iva_provisional,
      round(coalesce(sum(l.cuota_recargo_provisional), 0), 2) as recargo_provisional,
      round(coalesce(sum(l.total_provisional), 0), 2) as total_provisional
    from public.facturacion_borradores b
    left join public.facturacion_borrador_lineas l on l.borrador_id = b.id
    group by b.id
  ),
  holded_lineas as (
    select ml.factura_id, count(*) as lineas
    from public.manager_lineas ml
    group by ml.factura_id
  )
  select
    b.id,
    b.numero_interno,
    b.revision,
    b.estado,
    b.motivo_bloqueo,
    b.tipo_documento_previsto,
    b.fecha_operacion,
    b.updated_at,
    fc.id,
    fc.nombre_fiscal,
    fc.nombre_comercial,
    fc.estado_validacion,
    fc.holded_contact_id,
    p.id,
    p.fecha,
    poc.nombre,
    p.holded_invoice_id,
    coalesce(nullif(p.holded_invoice_num, ''), mf.doc_number),
    coalesce(p.holded_invoice_doc_type, mf.subtipo),
    coalesce(p.holded_status, mf.status::text),
    coalesce(p.holded_last_webhook_at, mf.updated_at),
    pr.lineas,
    pr.lineas_pendientes,
    pr.base_provisional,
    pr.iva_provisional,
    pr.recargo_provisional,
    pr.total_provisional,
    coalesce(hl.lineas, 0),
    mf.subtotal,
    coalesce(p.holded_total, mf.total),
    case
      when coalesce(p.holded_total, mf.total) is null then null
      else round(pr.total_provisional - coalesce(p.holded_total, mf.total), 2)
    end
  from public.facturacion_borradores b
  join propios pr on pr.borrador_id = b.id
  join public.facturacion_clientes fc on fc.id = b.cliente_id
  left join public.pedidos_wa p on p.id = b.pedido_wa_id
  left join public.pedidos_wa_clientes poc on poc.id = p.cliente_id
  left join public.manager_facturas mf on mf.id = p.holded_invoice_id
  left join holded_lineas hl on hl.factura_id = p.holded_invoice_id
  order by b.fecha_operacion desc, b.numero_interno desc;
$$;

comment on function public.facturacion_bandeja() is
  'Bandeja A5 con totales propios provisionales y referencia Holded de solo lectura.';

create or replace function public.facturacion_recalcular_borrador_estado(
  p_borrador_id uuid
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado_actual text;
  v_cliente_estado text;
  v_total_lineas integer;
  v_lineas_pendientes integer;
  v_estado_nuevo text;
  v_motivos text[] := array[]::text[];
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo administracion puede recalcular borradores' using errcode = '42501';
  end if;

  select b.estado, fc.estado_validacion
  into v_estado_actual, v_cliente_estado
  from public.facturacion_borradores b
  join public.facturacion_clientes fc on fc.id = b.cliente_id
  where b.id = p_borrador_id
  for update of b;

  if not found then
    raise exception 'Borrador no encontrado' using errcode = 'P0002';
  end if;

  if v_estado_actual in ('emitting', 'cancelled') then
    return v_estado_actual;
  end if;

  select
    count(*),
    count(*) filter (where l.precio_estado = 'pendiente')
  into v_total_lineas, v_lineas_pendientes
  from public.facturacion_borrador_lineas l
  where l.borrador_id = p_borrador_id;

  if v_cliente_estado <> 'validado' then
    v_motivos := array_append(
      v_motivos,
      'Ficha fiscal ' || coalesce(v_cliente_estado, 'sin validar')
    );
  end if;
  if v_total_lineas = 0 then
    v_motivos := array_append(v_motivos, 'Borrador sin lineas');
  elsif v_lineas_pendientes > 0 then
    v_motivos := array_append(
      v_motivos,
      v_lineas_pendientes::text || ' linea(s) sin precio'
    );
  end if;

  v_estado_nuevo := case
    when cardinality(v_motivos) = 0 then 'ready'
    else 'blocked'
  end;

  update public.facturacion_borradores b
  set estado = v_estado_nuevo,
      motivo_bloqueo = case
        when cardinality(v_motivos) = 0 then null
        else array_to_string(v_motivos, ' · ')
      end
  where b.id = p_borrador_id
    and row(b.estado, b.motivo_bloqueo) is distinct from row(
      v_estado_nuevo,
      case
        when cardinality(v_motivos) = 0 then null
        else array_to_string(v_motivos, ' · ')
      end
    );

  return v_estado_nuevo;
end;
$$;

create or replace function public.facturacion_recalcular_borradores_cliente(
  p_cliente_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_borrador record;
  v_recalculados integer := 0;
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo administracion puede recalcular borradores' using errcode = '42501';
  end if;

  for v_borrador in
    select b.id
    from public.facturacion_borradores b
    where b.cliente_id = p_cliente_id
      and b.estado not in ('emitting', 'cancelled')
    order by b.numero_interno
  loop
    perform public.facturacion_recalcular_borrador_estado(v_borrador.id);
    v_recalculados := v_recalculados + 1;
  end loop;

  return v_recalculados;
end;
$$;

revoke all on function public.facturacion_bandeja() from public, anon;
revoke all on function public.facturacion_recalcular_borrador_estado(uuid) from public, anon;
revoke all on function public.facturacion_recalcular_borradores_cliente(uuid) from public, anon;

grant execute on function public.facturacion_bandeja() to authenticated, service_role;
grant execute on function public.facturacion_recalcular_borrador_estado(uuid) to authenticated, service_role;
grant execute on function public.facturacion_recalcular_borradores_cliente(uuid) to authenticated, service_role;
