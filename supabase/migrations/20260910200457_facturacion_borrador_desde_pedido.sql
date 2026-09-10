-- ==========================================================================
-- Facturacion propia A4: un borrador en sombra por pedido confirmado
-- ==========================================================================
-- No emite, no numera fiscalmente y no sustituye todavia el envio a Holded.
-- El interruptor nace apagado para validar la funcion antes de activarla.
-- ==========================================================================

insert into public.app_settings (key, value)
values ('facturacion_shadow_borradores_enabled', 'false')
on conflict (key) do nothing;

create table public.facturacion_borrador_generacion_log (
  id            bigint generated always as identity primary key,
  pedido_wa_id  uuid not null
    references public.pedidos_wa(id) on delete cascade,
  borrador_id   uuid
    references public.facturacion_borradores(id) on delete set null,
  resultado     text not null
    check (resultado in ('creado', 'existente', 'omitido', 'error')),
  detalle       text,
  actor_id      uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at    timestamptz not null default now()
);

comment on table public.facturacion_borrador_generacion_log is
  'Resultado append-only de la generacion A4. Un error de sombra nunca bloquea el pedido operativo.';

create index facturacion_borrador_generacion_pedido_idx
  on public.facturacion_borrador_generacion_log (pedido_wa_id, created_at desc);
create index facturacion_borrador_generacion_borrador_idx
  on public.facturacion_borrador_generacion_log (borrador_id)
  where borrador_id is not null;
create index facturacion_borrador_generacion_actor_idx
  on public.facturacion_borrador_generacion_log (actor_id)
  where actor_id is not null;

alter table public.facturacion_borrador_generacion_log enable row level security;

create policy "facturacion_borrador_generacion_log: operativa read"
  on public.facturacion_borrador_generacion_log for select
  using (public.is_admin() or public.es_responsable());

revoke all on public.facturacion_borrador_generacion_log
  from anon, authenticated, service_role;
grant select on public.facturacion_borrador_generacion_log
  to authenticated, service_role;
revoke all on sequence public.facturacion_borrador_generacion_log_id_seq
  from anon, authenticated, service_role;

-- Funcion interna: el pedido y su cliente operativo quedan bloqueados para que
-- dos confirmaciones concurrentes no creen fichas o borradores duplicados.
create or replace function public.facturacion_crear_borrador_desde_pedido_internal(
  p_pedido_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pedido record;
  v_cliente_fiscal_id uuid;
  v_cliente_estado text;
  v_modalidad_habitual text;
  v_borrador_id uuid;
  v_tipo_documento text;
  v_total_lineas integer;
  v_lineas_pendientes integer;
  v_motivos text[] := array[]::text[];
begin
  select
    p.id,
    p.fecha,
    p.estado,
    p.cliente_id,
    c.nombre as cliente_nombre,
    c.holded_contact_id,
    c.holded_doc_type,
    c.tipo_factura,
    c.activo as cliente_activo
  into v_pedido
  from public.pedidos_wa p
  join public.pedidos_wa_clientes c on c.id = p.cliente_id
  where p.id = p_pedido_id
  for update of p, c;

  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;

  if v_pedido.estado <> 'confirmado'
    or not v_pedido.cliente_activo
    or v_pedido.tipo_factura = 'NINGUNA'
  then
    insert into public.facturacion_borrador_generacion_log (
      pedido_wa_id, resultado, detalle
    ) values (
      v_pedido.id,
      'omitido',
      case
        when v_pedido.estado <> 'confirmado' then 'Pedido no confirmado'
        when not v_pedido.cliente_activo then 'Cliente operativo inactivo'
        else 'Cliente configurado sin facturacion'
      end
    );
    return null;
  end if;

  select b.id into v_borrador_id
  from public.facturacion_borradores b
  where b.pedido_wa_id = v_pedido.id;

  if v_borrador_id is not null then
    insert into public.facturacion_borrador_generacion_log (
      pedido_wa_id, borrador_id, resultado, detalle
    ) values (
      v_pedido.id, v_borrador_id, 'existente', 'Reintento idempotente'
    );
    return v_borrador_id;
  end if;

  select fco.facturacion_cliente_id
  into v_cliente_fiscal_id
  from public.facturacion_cliente_operativo fco
  where fco.pedido_wa_cliente_id = v_pedido.cliente_id;

  -- Si falta la relacion, reutiliza primero la identidad Holded ya importada.
  if v_cliente_fiscal_id is null and v_pedido.holded_contact_id is not null then
    select fc.id into v_cliente_fiscal_id
    from public.facturacion_clientes fc
    where fc.holded_contact_id = v_pedido.holded_contact_id;
  end if;

  -- Un cliente nuevo no impide el modo sombra: crea una ficha incompleta que
  -- administracion debera revisar antes de que el borrador pueda estar listo.
  if v_cliente_fiscal_id is null then
    insert into public.facturacion_clientes (
      holded_contact_id,
      nombre_fiscal,
      nombre_comercial,
      modalidad_habitual,
      activo,
      origen
    ) values (
      v_pedido.holded_contact_id,
      v_pedido.cliente_nombre,
      v_pedido.cliente_nombre,
      case when v_pedido.holded_doc_type = 'waybill' then 'albaran' else 'factura_inmediata' end,
      true,
      case when v_pedido.holded_contact_id is null then 'manual' else 'holded' end
    )
    returning id into v_cliente_fiscal_id;
  end if;

  insert into public.facturacion_cliente_operativo (
    pedido_wa_cliente_id,
    facturacion_cliente_id
  ) values (
    v_pedido.cliente_id,
    v_cliente_fiscal_id
  )
  on conflict (pedido_wa_cliente_id) do update
  set facturacion_cliente_id = excluded.facturacion_cliente_id,
      updated_at = now();

  select fc.estado_validacion, fc.modalidad_habitual
  into v_cliente_estado, v_modalidad_habitual
  from public.facturacion_clientes fc
  where fc.id = v_cliente_fiscal_id;

  v_tipo_documento := case
    when v_pedido.holded_doc_type = 'waybill'
      or v_modalidad_habitual = 'albaran'
      then 'albaran'
    else 'factura'
  end;

  insert into public.facturacion_borradores (
    origen,
    pedido_wa_id,
    origen_referencia,
    cliente_id,
    tipo_documento_previsto,
    fecha_operacion,
    fecha_expedicion_prevista,
    fecha_vencimiento_prevista,
    estado,
    motivo_bloqueo,
    notas
  ) values (
    'pedido_wa',
    v_pedido.id,
    v_pedido.id::text,
    v_cliente_fiscal_id,
    v_tipo_documento,
    v_pedido.fecha + 1,
    v_pedido.fecha + 1,
    case when v_tipo_documento = 'factura' then v_pedido.fecha + 1 else null end,
    'blocked',
    'Pendiente de validacion del borrador en sombra',
    null
  )
  on conflict (pedido_wa_id) where pedido_wa_id is not null do nothing
  returning id into v_borrador_id;

  if v_borrador_id is null then
    select b.id into v_borrador_id
    from public.facturacion_borradores b
    where b.pedido_wa_id = v_pedido.id;

    insert into public.facturacion_borrador_generacion_log (
      pedido_wa_id, borrador_id, resultado, detalle
    ) values (
      v_pedido.id, v_borrador_id, 'existente', 'Concurrencia resuelta por indice unico'
    );
    return v_borrador_id;
  end if;

  insert into public.facturacion_borrador_lineas (
    borrador_id,
    pedido_wa_linea_id,
    orden,
    producto_referencia,
    producto_origen,
    descripcion,
    cantidad,
    unidad,
    precio_unitario,
    precio_estado,
    precio_fuente,
    precio_fecha,
    iva_pct,
    trazabilidad
  )
  select
    v_borrador_id,
    r.linea_id,
    r.orden,
    r.holded_product_id,
    case when r.holded_product_id is null then 'sin_vincular' else 'holded_legacy' end,
    coalesce(nullif(btrim(r.holded_product_name), ''), r.producto_normalizado),
    r.cantidad,
    r.unidad,
    case when r.precio_fuente = 'no_resuelto' then null else r.precio_resuelto end,
    case
      when r.precio_fuente = 'no_resuelto' then 'pendiente'
      when r.precio_fuente = 'gratis' then 'gratis'
      else 'resuelto'
    end,
    case when r.precio_fuente = 'no_resuelto' then null else r.precio_fuente end,
    case when r.precio_fuente = 'no_resuelto' then null else r.precio_fecha end,
    r.iva_pct,
    r.trazabilidad
  from public.pedidos_wa_resolver_completo(v_pedido.id) r
  order by r.orden;

  select
    count(*),
    count(*) filter (where l.precio_estado = 'pendiente')
  into v_total_lineas, v_lineas_pendientes
  from public.facturacion_borrador_lineas l
  where l.borrador_id = v_borrador_id;

  if v_cliente_estado <> 'validado' then
    v_motivos := array_append(v_motivos, 'Ficha fiscal ' || coalesce(v_cliente_estado, 'sin validar'));
  end if;
  if v_total_lineas = 0 then
    v_motivos := array_append(v_motivos, 'Pedido sin lineas resueltas');
  elsif v_lineas_pendientes > 0 then
    v_motivos := array_append(
      v_motivos,
      v_lineas_pendientes::text || ' linea(s) sin precio'
    );
  end if;

  update public.facturacion_borradores
  set estado = case when cardinality(v_motivos) = 0 then 'ready' else 'blocked' end,
      motivo_bloqueo = case
        when cardinality(v_motivos) = 0 then null
        else array_to_string(v_motivos, ' · ')
      end
  where id = v_borrador_id;

  insert into public.facturacion_borrador_generacion_log (
    pedido_wa_id, borrador_id, resultado, detalle
  ) values (
    v_pedido.id,
    v_borrador_id,
    'creado',
    v_total_lineas::text || ' linea(s); ' || v_lineas_pendientes::text || ' pendiente(s)'
  );

  return v_borrador_id;
end;
$$;

revoke all on function public.facturacion_crear_borrador_desde_pedido_internal(uuid)
  from public, anon, authenticated, service_role;

-- Entrada manual controlada para reintentar un pedido confirmado desde soporte.
create or replace function public.facturacion_reintentar_borrador_desde_pedido(
  p_pedido_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo administracion puede reintentar borradores' using errcode = '42501';
  end if;

  return public.facturacion_crear_borrador_desde_pedido_internal(p_pedido_id);
end;
$$;

revoke all on function public.facturacion_reintentar_borrador_desde_pedido(uuid)
  from public, anon;
grant execute on function public.facturacion_reintentar_borrador_desde_pedido(uuid)
  to authenticated, service_role;

create or replace function public.facturacion_pedido_confirmado_shadow()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enabled boolean;
begin
  select coalesce(lower(s.value) = 'true', false)
  into v_enabled
  from public.app_settings s
  where s.key = 'facturacion_shadow_borradores_enabled';

  if not coalesce(v_enabled, false) then
    return new;
  end if;
  if new.estado <> 'confirmado' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'confirmado' then
    return new;
  end if;

  begin
    perform public.facturacion_crear_borrador_desde_pedido_internal(new.id);
  exception when others then
    insert into public.facturacion_borrador_generacion_log (
      pedido_wa_id, resultado, detalle
    ) values (
      new.id,
      'error',
      left(sqlstate || ': ' || sqlerrm, 1000)
    );
  end;

  return new;
end;
$$;

revoke all on function public.facturacion_pedido_confirmado_shadow()
  from public, anon, authenticated, service_role;

create trigger facturacion_pedido_confirmado_shadow_insert
  after insert on public.pedidos_wa
  for each row execute function public.facturacion_pedido_confirmado_shadow();

create trigger facturacion_pedido_confirmado_shadow_update
  after update of estado on public.pedidos_wa
  for each row execute function public.facturacion_pedido_confirmado_shadow();
