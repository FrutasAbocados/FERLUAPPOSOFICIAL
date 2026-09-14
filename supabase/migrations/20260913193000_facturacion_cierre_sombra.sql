-- ============================================================================
-- Facturacion propia A6: cierre de revision en modo sombra
-- ============================================================================
-- Este cierre es un control interno previo a la emision. Congela una copia
-- verificable de lo revisado contra Holded, pero NO es un registro fiscal,
-- NO usa la huella reglamentaria VERI*FACTU y NO reserva numeracion fiscal.
-- ============================================================================

create table public.facturacion_revision_sombra_eventos (
  id                         bigint generated always as identity primary key,
  borrador_id                uuid not null
    references public.facturacion_borradores(id) on delete restrict,
  secuencia                  integer not null check (secuencia > 0),
  accion                     text not null check (accion in ('cerrado', 'reabierto')),
  revision_documento         integer not null check (revision_documento > 0),
  motivo                     text,
  snapshot                   jsonb,
  snapshot_sha256            text,
  cliente_updated_at         timestamptz,
  total_propio               numeric(14,2),
  lineas_propias             integer,
  holded_documento_id        text,
  holded_documento_numero    text,
  holded_total               numeric(14,2),
  holded_lineas              integer,
  holded_lineas_sha256       text,
  diferencia_holded          numeric(14,2),
  declaracion                text,
  actor_id                   uuid default auth.uid()
    references auth.users(id) on delete set null,
  occurred_at                timestamptz not null default now(),
  constraint facturacion_revision_sombra_eventos_secuencia_uniq
    unique (borrador_id, secuencia),
  constraint facturacion_revision_sombra_eventos_forma_check check (
    (
      accion = 'cerrado'
      and snapshot is not null
      and snapshot_sha256 is not null
      and snapshot_sha256 ~ '^[0-9a-f]{64}$'
      and cliente_updated_at is not null
      and total_propio is not null
      and lineas_propias is not null
      and lineas_propias > 0
      and holded_documento_id is not null
      and holded_total is not null
      and holded_lineas is not null
      and holded_lineas > 0
      and holded_lineas_sha256 is not null
      and holded_lineas_sha256 ~ '^[0-9a-f]{64}$'
      and diferencia_holded is not null
      and declaracion is not null
      and motivo is null
    )
    or
    (
      accion = 'reabierto'
      and motivo is not null
      and length(btrim(motivo)) >= 8
      and snapshot is null
      and snapshot_sha256 is null
      and cliente_updated_at is null
      and total_propio is null
      and lineas_propias is null
      and holded_documento_id is null
      and holded_documento_numero is null
      and holded_total is null
      and holded_lineas is null
      and holded_lineas_sha256 is null
      and diferencia_holded is null
      and declaracion is null
    )
  )
);

comment on table public.facturacion_revision_sombra_eventos is
  'Eventos append-only de cierre/reapertura interna A6. Sus SHA-256 no son huellas fiscales VERI*FACTU.';
comment on column public.facturacion_revision_sombra_eventos.snapshot_sha256 is
  'Integridad interna del snapshot JSON A6; no es la huella reglamentaria de un registro fiscal.';

create index facturacion_revision_sombra_eventos_borrador_idx
  on public.facturacion_revision_sombra_eventos (borrador_id, secuencia desc);
create index facturacion_revision_sombra_eventos_actor_idx
  on public.facturacion_revision_sombra_eventos (actor_id)
  where actor_id is not null;

alter table public.facturacion_revision_sombra_eventos enable row level security;

create policy "facturacion revision sombra: admin read"
  on public.facturacion_revision_sombra_eventos for select
  using (public.is_admin());

revoke all on public.facturacion_revision_sombra_eventos from public, anon, authenticated;
grant select on public.facturacion_revision_sombra_eventos to authenticated, service_role;

-- La tabla es append-only incluso para backends. Una correccion se representa
-- con un evento de reapertura y un cierre posterior, nunca reescribiendo historia.
create or replace function public.facturacion_revision_sombra_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Los eventos de revision sombra son inmutables' using errcode = '55000';
end;
$$;

create trigger facturacion_revision_sombra_eventos_append_only
  before update or delete on public.facturacion_revision_sombra_eventos
  for each row execute function public.facturacion_revision_sombra_append_only();

-- Mientras el ultimo evento sea un cierre, las lineas quedan congeladas.
create or replace function public.facturacion_bloquear_linea_cerrada_sombra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrador_id uuid;
  v_ultima_accion text;
begin
  v_borrador_id := case when tg_op = 'DELETE' then old.borrador_id else new.borrador_id end;

  select e.accion
  into v_ultima_accion
  from public.facturacion_revision_sombra_eventos e
  where e.borrador_id = v_borrador_id
  order by e.secuencia desc
  limit 1;

  if v_ultima_accion = 'cerrado' then
    raise exception 'Reabre la revision sombra antes de modificar sus lineas'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger facturacion_borrador_lineas_00_guard_cierre_sombra
  before insert or update or delete on public.facturacion_borrador_lineas
  for each row execute function public.facturacion_bloquear_linea_cerrada_sombra();

create or replace function public.facturacion_cerrar_revision_sombra(
  p_borrador_id uuid
)
returns table (
  evento_id bigint,
  secuencia integer,
  snapshot_sha256 text,
  ocurrido_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_borrador public.facturacion_borradores%rowtype;
  v_cliente public.facturacion_clientes%rowtype;
  v_ultima_accion text;
  v_secuencia integer;
  v_lineas_propias integer;
  v_lineas_pendientes integer;
  v_total_propio numeric(14,2);
  v_lineas_json jsonb;
  v_holded_id text;
  v_holded_numero text;
  v_holded_tipo text;
  v_holded_estado text;
  v_holded_total numeric(14,2);
  v_holded_lineas integer;
  v_holded_lineas_json jsonb;
  v_holded_lineas_sha text;
  v_diferencia numeric(14,2);
  v_snapshot jsonb;
  v_snapshot_sha text;
  v_declaracion constant text :=
    'Revision interna contrastada con Holded. No constituye emision ni registro fiscal.';
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo administracion puede cerrar revisiones' using errcode = '42501';
  end if;

  perform public.facturacion_recalcular_borrador_estado(p_borrador_id);

  select b.*
  into v_borrador
  from public.facturacion_borradores b
  where b.id = p_borrador_id
  for update;

  if not found then
    raise exception 'Borrador no encontrado' using errcode = 'P0002';
  end if;

  select e.accion
  into v_ultima_accion
  from public.facturacion_revision_sombra_eventos e
  where e.borrador_id = p_borrador_id
  order by e.secuencia desc
  limit 1;

  if v_ultima_accion = 'cerrado' then
    raise exception 'La revision ya esta cerrada' using errcode = '55000';
  end if;

  if v_borrador.estado <> 'ready' then
    raise exception 'El borrador debe estar listo antes de cerrar la revision'
      using errcode = '55000';
  end if;

  select fc.*
  into v_cliente
  from public.facturacion_clientes fc
  where fc.id = v_borrador.cliente_id;

  if v_cliente.estado_validacion <> 'validado' then
    raise exception 'La ficha fiscal debe estar validada' using errcode = '55000';
  end if;

  select
    count(*)::integer,
    count(*) filter (where l.precio_estado = 'pendiente')::integer,
    round(coalesce(sum(l.total_provisional), 0), 2),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'orden', l.orden,
          'producto_referencia', l.producto_referencia,
          'descripcion', l.descripcion,
          'cantidad', l.cantidad,
          'unidad', l.unidad,
          'precio_unitario', l.precio_unitario,
          'descuento_pct', l.descuento_pct,
          'iva_pct', l.iva_pct,
          'recargo_equivalencia_pct', l.recargo_equivalencia_pct,
          'regimen_iva', l.regimen_iva,
          'base', l.base_provisional,
          'cuota_iva', l.cuota_iva_provisional,
          'cuota_recargo', l.cuota_recargo_provisional,
          'total', l.total_provisional
        ) order by l.orden
      ),
      '[]'::jsonb
    )
  into v_lineas_propias, v_lineas_pendientes, v_total_propio, v_lineas_json
  from public.facturacion_borrador_lineas l
  where l.borrador_id = p_borrador_id;

  if v_lineas_propias = 0 or v_lineas_pendientes > 0 then
    raise exception 'El borrador tiene lineas incompletas' using errcode = '55000';
  end if;

  select
    p.holded_invoice_id,
    coalesce(nullif(p.holded_invoice_num, ''), mf.doc_number),
    coalesce(p.holded_invoice_doc_type, mf.subtipo),
    coalesce(p.holded_status, mf.status::text),
    round(coalesce(p.holded_total, mf.total), 2)
  into v_holded_id, v_holded_numero, v_holded_tipo, v_holded_estado, v_holded_total
  from public.pedidos_wa p
  left join public.manager_facturas mf on mf.id = p.holded_invoice_id
  where p.id = v_borrador.pedido_wa_id;

  if v_holded_id is null or v_holded_total is null then
    raise exception 'Falta el documento de contraste en Holded' using errcode = '55000';
  end if;

  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ml.id,
          'product_id', ml.product_id,
          'nombre', ml.nombre,
          'units', ml.units,
          'price', ml.price,
          'subtotal', ml.subtotal,
          'tax_rate', ml.tax_rate
        ) order by ml.id
      ),
      '[]'::jsonb
    )
  into v_holded_lineas, v_holded_lineas_json
  from public.manager_lineas ml
  where ml.factura_id = v_holded_id;

  if v_holded_lineas = 0 then
    raise exception 'El documento Holded no tiene lineas sincronizadas' using errcode = '55000';
  end if;

  v_diferencia := round(v_total_propio - v_holded_total, 2);
  if abs(v_diferencia) > 0.01 then
    raise exception 'El total propio no cuadra con Holded' using errcode = '55000';
  end if;

  v_holded_lineas_sha := encode(
    extensions.digest(convert_to(v_holded_lineas_json::text, 'UTF8'), 'sha256'),
    'hex'
  );

  v_snapshot := jsonb_build_object(
    'schema', 'abocadosos_revision_sombra_v1',
    'naturaleza', 'control_interno_no_fiscal',
    'borrador', jsonb_build_object(
      'id', v_borrador.id,
      'numero_interno', v_borrador.numero_interno,
      'revision', v_borrador.revision,
      'tipo_documento_previsto', v_borrador.tipo_documento_previsto,
      'fecha_operacion', v_borrador.fecha_operacion,
      'moneda', v_borrador.moneda,
      'total', v_total_propio
    ),
    'cliente', jsonb_build_object(
      'id', v_cliente.id,
      'nombre_fiscal', v_cliente.nombre_fiscal,
      'tipo_identificacion', v_cliente.tipo_identificacion,
      'numero_identificacion', v_cliente.numero_identificacion,
      'direccion', v_cliente.direccion,
      'codigo_postal', v_cliente.codigo_postal,
      'poblacion', v_cliente.poblacion,
      'provincia', v_cliente.provincia,
      'pais_codigo', v_cliente.pais_codigo,
      'updated_at', v_cliente.updated_at
    ),
    'lineas_propias', v_lineas_json,
    'holded', jsonb_build_object(
      'documento_id', v_holded_id,
      'numero', v_holded_numero,
      'tipo', v_holded_tipo,
      'estado', v_holded_estado,
      'total', v_holded_total,
      'lineas', v_holded_lineas_json
    ),
    'declaracion', v_declaracion
  );

  v_snapshot_sha := encode(
    extensions.digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select coalesce(max(e.secuencia), 0) + 1
  into v_secuencia
  from public.facturacion_revision_sombra_eventos e
  where e.borrador_id = p_borrador_id;

  return query
  insert into public.facturacion_revision_sombra_eventos as e (
    borrador_id,
    secuencia,
    accion,
    revision_documento,
    snapshot,
    snapshot_sha256,
    cliente_updated_at,
    total_propio,
    lineas_propias,
    holded_documento_id,
    holded_documento_numero,
    holded_total,
    holded_lineas,
    holded_lineas_sha256,
    diferencia_holded,
    declaracion,
    actor_id
  ) values (
    p_borrador_id,
    v_secuencia,
    'cerrado',
    v_borrador.revision,
    v_snapshot,
    v_snapshot_sha,
    v_cliente.updated_at,
    v_total_propio,
    v_lineas_propias,
    v_holded_id,
    v_holded_numero,
    v_holded_total,
    v_holded_lineas,
    v_holded_lineas_sha,
    v_diferencia,
    v_declaracion,
    auth.uid()
  )
  returning e.id, e.secuencia, e.snapshot_sha256, e.occurred_at;
end;
$$;

create or replace function public.facturacion_reabrir_revision_sombra(
  p_borrador_id uuid,
  p_motivo text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ultima_accion text;
  v_secuencia integer;
  v_evento_id bigint;
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo administracion puede reabrir revisiones' using errcode = '42501';
  end if;

  perform 1
  from public.facturacion_borradores b
  where b.id = p_borrador_id
  for update;

  if not found then
    raise exception 'Borrador no encontrado' using errcode = 'P0002';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 8 then
    raise exception 'Indica un motivo de al menos 8 caracteres' using errcode = '22023';
  end if;

  select e.accion, e.secuencia + 1
  into v_ultima_accion, v_secuencia
  from public.facturacion_revision_sombra_eventos e
  where e.borrador_id = p_borrador_id
  order by e.secuencia desc
  limit 1;

  if v_ultima_accion is distinct from 'cerrado' then
    raise exception 'La revision no esta cerrada' using errcode = '55000';
  end if;

  insert into public.facturacion_revision_sombra_eventos (
    borrador_id,
    secuencia,
    accion,
    revision_documento,
    motivo,
    actor_id
  )
  select
    p_borrador_id,
    v_secuencia,
    'reabierto',
    b.revision,
    btrim(p_motivo),
    auth.uid()
  from public.facturacion_borradores b
  where b.id = p_borrador_id
  returning id into v_evento_id;

  return v_evento_id;
end;
$$;

create or replace function public.facturacion_revision_sombra_actual()
returns table (
  borrador_id uuid,
  accion text,
  secuencia integer,
  revision_documento integer,
  ocurrido_at timestamptz,
  motivo text,
  snapshot_sha256 text,
  vigente boolean,
  motivo_invalidez text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo administracion puede consultar revisiones' using errcode = '42501';
  end if;

  return query
  with latest as (
    select distinct on (e.borrador_id) e.*
    from public.facturacion_revision_sombra_eventos e
    order by e.borrador_id, e.secuencia desc
  ), propios as (
    select
      l.borrador_id,
      count(*)::integer as lineas,
      round(coalesce(sum(l.total_provisional), 0), 2) as total
    from public.facturacion_borrador_lineas l
    group by l.borrador_id
  ), holded_docs as (
    select
      p.id as pedido_id,
      p.holded_invoice_id,
      round(coalesce(p.holded_total, mf.total), 2) as total
    from public.pedidos_wa p
    left join public.manager_facturas mf on mf.id = p.holded_invoice_id
  ), holded_lines as (
    select
      ml.factura_id,
      encode(
        extensions.digest(
          convert_to(
            jsonb_agg(
              jsonb_build_object(
                'id', ml.id,
                'product_id', ml.product_id,
                'nombre', ml.nombre,
                'units', ml.units,
                'price', ml.price,
                'subtotal', ml.subtotal,
                'tax_rate', ml.tax_rate
              ) order by ml.id
            )::text,
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as contenido_sha256
    from public.manager_lineas ml
    group by ml.factura_id
  )
  select
    b.id,
    e.accion,
    e.secuencia,
    e.revision_documento,
    e.occurred_at,
    e.motivo,
    e.snapshot_sha256,
    (
      e.accion = 'cerrado'
      and b.revision = e.revision_documento
      and fc.estado_validacion = 'validado'
      and fc.updated_at <= e.occurred_at
      and pr.lineas = e.lineas_propias
      and pr.total = e.total_propio
      and hd.holded_invoice_id = e.holded_documento_id
      and hd.total = e.holded_total
      and hl.contenido_sha256 = e.holded_lineas_sha256
    ) as vigente,
    case
      when e.accion = 'reabierto' then 'Revision reabierta'
      when b.revision <> e.revision_documento then 'El borrador cambio despues del cierre'
      when fc.estado_validacion <> 'validado' then 'La ficha fiscal dejo de estar validada'
      when fc.updated_at > e.occurred_at then 'La ficha fiscal cambio despues del cierre'
      when hd.holded_invoice_id is distinct from e.holded_documento_id then 'Cambio el documento Holded'
      when hd.total is distinct from e.holded_total then 'Cambio el total Holded'
      when hl.contenido_sha256 is distinct from e.holded_lineas_sha256 then 'Cambiaron las lineas Holded'
      when pr.lineas is distinct from e.lineas_propias then 'Cambio el numero de lineas propias'
      when pr.total is distinct from e.total_propio then 'Cambio el total propio'
      else null
    end
  from public.facturacion_borradores b
  join latest e on e.borrador_id = b.id
  join public.facturacion_clientes fc on fc.id = b.cliente_id
  left join propios pr on pr.borrador_id = b.id
  left join holded_docs hd on hd.pedido_id = b.pedido_wa_id
  left join holded_lines hl on hl.factura_id = hd.holded_invoice_id;
end;
$$;

revoke all on function public.facturacion_revision_sombra_append_only() from public, anon, authenticated;
revoke all on function public.facturacion_bloquear_linea_cerrada_sombra() from public, anon, authenticated;
revoke all on function public.facturacion_cerrar_revision_sombra(uuid) from public, anon;
revoke all on function public.facturacion_reabrir_revision_sombra(uuid, text) from public, anon;
revoke all on function public.facturacion_revision_sombra_actual() from public, anon;

grant execute on function public.facturacion_cerrar_revision_sombra(uuid) to authenticated, service_role;
grant execute on function public.facturacion_reabrir_revision_sombra(uuid, text) to authenticated, service_role;
grant execute on function public.facturacion_revision_sombra_actual() to authenticated, service_role;
