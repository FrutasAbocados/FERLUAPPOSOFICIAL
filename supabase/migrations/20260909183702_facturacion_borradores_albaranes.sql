-- ==========================================================================
-- Facturacion propia A3: borradores y albaranes editables
-- ==========================================================================
-- Esta fase no emite facturas ni reserva numeracion fiscal. Los importes son
-- provisionales hasta que el motor fiscal B1 los recalcule en servidor.
-- ==========================================================================

create table public.facturacion_borradores (
  id                         uuid primary key default gen_random_uuid(),
  numero_interno             bigint generated always as identity unique,
  origen                     text not null default 'manual'
    check (origen in ('pedido_wa', 'manual', 'importacion')),
  pedido_wa_id               uuid references public.pedidos_wa(id) on delete restrict,
  origen_referencia          text,
  cliente_id                 uuid not null
    references public.facturacion_clientes(id) on delete restrict,
  tipo_documento_previsto    text not null
    check (tipo_documento_previsto in ('factura', 'albaran')),
  fecha_operacion            date not null default current_date,
  fecha_expedicion_prevista  date,
  fecha_vencimiento_prevista date,
  estado                     text not null default 'draft'
    check (estado in ('draft', 'ready', 'blocked', 'emitting', 'cancelled')),
  motivo_bloqueo             text,
  revision                   integer not null default 1 check (revision > 0),
  clave_idempotencia_emision uuid unique,
  moneda                     text not null default 'EUR'
    check (moneda ~ '^[A-Z]{3}$'),
  notas                      text,
  created_by                 uuid references auth.users(id) on delete set null
    default auth.uid(),
  updated_by                 uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint facturacion_borradores_origen_pedido_check check (
    (origen = 'pedido_wa' and pedido_wa_id is not null)
    or (origen <> 'pedido_wa' and pedido_wa_id is null)
  ),
  constraint facturacion_borradores_fechas_check check (
    fecha_vencimiento_prevista is null
    or fecha_expedicion_prevista is null
    or fecha_vencimiento_prevista >= fecha_expedicion_prevista
  )
);

comment on table public.facturacion_borradores is
  'Documento editable previo a una factura o albaran. No tiene validez ni numeracion fiscal.';
comment on column public.facturacion_borradores.numero_interno is
  'Referencia interna con huecos permitidos; nunca es el numero fiscal.';
comment on column public.facturacion_borradores.clave_idempotencia_emision is
  'Reserva de contrato para B2; no provoca emision en A3.';

create unique index facturacion_borradores_pedido_wa_uniq
  on public.facturacion_borradores (pedido_wa_id)
  where pedido_wa_id is not null;
create index facturacion_borradores_cliente_fecha_idx
  on public.facturacion_borradores (cliente_id, fecha_operacion desc);
create index facturacion_borradores_estado_fecha_idx
  on public.facturacion_borradores (estado, fecha_operacion desc);

create table public.facturacion_borrador_lineas (
  id                          uuid primary key default gen_random_uuid(),
  borrador_id                 uuid not null
    references public.facturacion_borradores(id) on delete cascade,
  pedido_wa_linea_id          uuid
    references public.pedidos_wa_lineas(id) on delete set null,
  orden                       integer not null check (orden > 0),
  producto_referencia         text,
  producto_origen             text not null default 'sin_vincular'
    check (producto_origen in ('holded_legacy', 'manual', 'sin_vincular')),
  descripcion                 text not null check (btrim(descripcion) <> ''),
  cantidad                    numeric(14,3) not null check (cantidad > 0),
  unidad                      text not null check (btrim(unidad) <> ''),
  precio_unitario             numeric(14,6) check (precio_unitario >= 0),
  precio_estado               text not null default 'pendiente'
    check (precio_estado in ('pendiente', 'resuelto', 'manual', 'gratis')),
  precio_fuente               text check (
    precio_fuente is null or precio_fuente in (
      'historico_cliente', 'tarifa_base', 'ultima_venta_global',
      'margen_minimo', 'manual', 'gratis'
    )
  ),
  precio_fecha                date,
  descuento_pct               numeric(5,2) not null default 0
    check (descuento_pct >= 0 and descuento_pct <= 100),
  iva_pct                     numeric(5,2) not null default 4
    check (iva_pct >= 0 and iva_pct <= 100),
  recargo_equivalencia_pct    numeric(5,2) not null default 0
    check (recargo_equivalencia_pct >= 0 and recargo_equivalencia_pct <= 100),
  regimen_iva                 text not null default 'general'
    check (regimen_iva in ('general', 'exento', 'no_sujeto', 'inversion_sujeto_pasivo', 'otro')),
  motivo_exencion             text,
  trazabilidad                text,
  lote                        text,
  notas                       text,
  base_provisional            numeric(14,2) generated always as (
    case when precio_unitario is null then null else
      round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
    end
  ) stored,
  cuota_iva_provisional       numeric(14,2) generated always as (
    case when precio_unitario is null then null else
      round(
        round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
        * iva_pct / 100,
        2
      )
    end
  ) stored,
  cuota_recargo_provisional   numeric(14,2) generated always as (
    case when precio_unitario is null then null else
      round(
        round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
        * recargo_equivalencia_pct / 100,
        2
      )
    end
  ) stored,
  total_provisional           numeric(14,2) generated always as (
    case when precio_unitario is null then null else
      round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
      + round(
          round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
          * iva_pct / 100,
          2
        )
      + round(
          round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
          * recargo_equivalencia_pct / 100,
          2
        )
    end
  ) stored,
  created_by                  uuid references auth.users(id) on delete set null
    default auth.uid(),
  updated_by                  uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint facturacion_borrador_lineas_orden_uniq unique (borrador_id, orden),
  constraint facturacion_borrador_lineas_precio_check check (
    (precio_estado = 'pendiente' and precio_unitario is null)
    or (precio_estado <> 'pendiente' and precio_unitario is not null)
  ),
  constraint facturacion_borrador_lineas_gratis_check check (
    precio_estado <> 'gratis' or precio_unitario = 0
  )
);

comment on table public.facturacion_borrador_lineas is
  'Lineas editables con calculos provisionales. B1 recalculara los importes fiscales definitivos.';

create index facturacion_borrador_lineas_pedido_idx
  on public.facturacion_borrador_lineas (pedido_wa_linea_id)
  where pedido_wa_linea_id is not null;

create table public.facturacion_albaranes (
  id                   uuid primary key default gen_random_uuid(),
  numero_interno       bigint generated always as identity unique,
  borrador_id          uuid unique
    references public.facturacion_borradores(id) on delete restrict,
  pedido_wa_id         uuid
    references public.pedidos_wa(id) on delete restrict,
  cliente_id           uuid not null
    references public.facturacion_clientes(id) on delete restrict,
  fecha_albaran        date not null default current_date,
  estado_entrega       text not null default 'draft'
    check (estado_entrega in ('draft', 'ready', 'in_transit', 'delivered', 'rejected', 'cancelled')),
  estado_facturacion   text not null default 'pending'
    check (estado_facturacion in ('pending', 'partial', 'invoiced', 'not_billable', 'cancelled')),
  fecha_entrega        timestamptz,
  entregado_a          text,
  revision             integer not null default 1 check (revision > 0),
  notas                text,
  created_by           uuid references auth.users(id) on delete set null
    default auth.uid(),
  updated_by           uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint facturacion_albaranes_entrega_check check (
    (estado_entrega = 'delivered' and fecha_entrega is not null)
    or estado_entrega <> 'delivered'
  ),
  constraint facturacion_albaranes_cancelado_check check (
    estado_entrega <> 'cancelled' or estado_facturacion = 'cancelled'
  )
);

comment on table public.facturacion_albaranes is
  'Documento operativo editable, separado de la factura fiscal y de su numeracion.';
comment on column public.facturacion_albaranes.numero_interno is
  'Referencia interna con huecos permitidos; nunca es una serie o numero fiscal.';
comment on column public.facturacion_albaranes.estado_facturacion is
  'Estado operativo; el saldo se calculara desde relaciones de lineas, nunca se almacena como importe mutable.';

create unique index facturacion_albaranes_pedido_wa_uniq
  on public.facturacion_albaranes (pedido_wa_id)
  where pedido_wa_id is not null;
create index facturacion_albaranes_cliente_fecha_idx
  on public.facturacion_albaranes (cliente_id, fecha_albaran desc);
create index facturacion_albaranes_estados_fecha_idx
  on public.facturacion_albaranes (estado_entrega, estado_facturacion, fecha_albaran desc);

create table public.facturacion_albaran_lineas (
  id                          uuid primary key default gen_random_uuid(),
  albaran_id                  uuid not null
    references public.facturacion_albaranes(id) on delete cascade,
  borrador_linea_id           uuid
    references public.facturacion_borrador_lineas(id) on delete set null,
  pedido_wa_linea_id          uuid
    references public.pedidos_wa_lineas(id) on delete set null,
  orden                       integer not null check (orden > 0),
  producto_referencia         text,
  producto_origen             text not null default 'sin_vincular'
    check (producto_origen in ('holded_legacy', 'manual', 'sin_vincular')),
  descripcion                 text not null check (btrim(descripcion) <> ''),
  cantidad                    numeric(14,3) not null check (cantidad > 0),
  unidad                      text not null check (btrim(unidad) <> ''),
  precio_unitario             numeric(14,6) check (precio_unitario >= 0),
  precio_estado               text not null default 'pendiente'
    check (precio_estado in ('pendiente', 'resuelto', 'manual', 'gratis')),
  precio_fuente               text check (
    precio_fuente is null or precio_fuente in (
      'historico_cliente', 'tarifa_base', 'ultima_venta_global',
      'margen_minimo', 'manual', 'gratis'
    )
  ),
  precio_fecha                date,
  descuento_pct               numeric(5,2) not null default 0
    check (descuento_pct >= 0 and descuento_pct <= 100),
  iva_pct                     numeric(5,2) not null default 4
    check (iva_pct >= 0 and iva_pct <= 100),
  recargo_equivalencia_pct    numeric(5,2) not null default 0
    check (recargo_equivalencia_pct >= 0 and recargo_equivalencia_pct <= 100),
  regimen_iva                 text not null default 'general'
    check (regimen_iva in ('general', 'exento', 'no_sujeto', 'inversion_sujeto_pasivo', 'otro')),
  motivo_exencion             text,
  trazabilidad                text,
  lote                        text,
  notas                       text,
  base_provisional            numeric(14,2) generated always as (
    case when precio_unitario is null then null else
      round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
    end
  ) stored,
  cuota_iva_provisional       numeric(14,2) generated always as (
    case when precio_unitario is null then null else
      round(
        round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
        * iva_pct / 100,
        2
      )
    end
  ) stored,
  cuota_recargo_provisional   numeric(14,2) generated always as (
    case when precio_unitario is null then null else
      round(
        round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
        * recargo_equivalencia_pct / 100,
        2
      )
    end
  ) stored,
  total_provisional           numeric(14,2) generated always as (
    case when precio_unitario is null then null else
      round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
      + round(
          round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
          * iva_pct / 100,
          2
        )
      + round(
          round(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
          * recargo_equivalencia_pct / 100,
          2
        )
    end
  ) stored,
  created_by                  uuid references auth.users(id) on delete set null
    default auth.uid(),
  updated_by                  uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint facturacion_albaran_lineas_orden_uniq unique (albaran_id, orden),
  constraint facturacion_albaran_lineas_precio_check check (
    (precio_estado = 'pendiente' and precio_unitario is null)
    or (precio_estado <> 'pendiente' and precio_unitario is not null)
  ),
  constraint facturacion_albaran_lineas_gratis_check check (
    precio_estado <> 'gratis' or precio_unitario = 0
  )
);

comment on table public.facturacion_albaran_lineas is
  'Snapshot editable de lineas del albaran; cada correccion queda en la auditoria append-only.';

create index facturacion_albaran_lineas_borrador_idx
  on public.facturacion_albaran_lineas (borrador_linea_id)
  where borrador_linea_id is not null;
create index facturacion_albaran_lineas_pedido_idx
  on public.facturacion_albaran_lineas (pedido_wa_linea_id)
  where pedido_wa_linea_id is not null;

create table public.facturacion_eventos_editables (
  id                  bigint generated always as identity primary key,
  entidad_tipo        text not null check (entidad_tipo in (
    'borrador', 'borrador_linea', 'albaran', 'albaran_linea'
  )),
  entidad_id          uuid not null,
  documento_id        uuid not null,
  revision_documento  integer,
  accion              text not null check (accion in ('creado', 'actualizado', 'eliminado')),
  datos_anteriores    jsonb,
  datos_nuevos        jsonb,
  actor_id            uuid references auth.users(id) on delete set null,
  occurred_at         timestamptz not null default now(),
  constraint facturacion_eventos_editables_datos_check check (
    (accion = 'creado' and datos_anteriores is null and datos_nuevos is not null)
    or (accion = 'actualizado' and datos_anteriores is not null and datos_nuevos is not null)
    or (accion = 'eliminado' and datos_anteriores is not null and datos_nuevos is null)
  )
);

comment on table public.facturacion_eventos_editables is
  'Auditoria append-only de A3. Conserva cada version sin permitir edicion directa.';

create index facturacion_eventos_documento_idx
  on public.facturacion_eventos_editables (documento_id, occurred_at, id);
create index facturacion_eventos_entidad_idx
  on public.facturacion_eventos_editables (entidad_tipo, entidad_id, id);

-- Fija actor/fechas y hace que revision solo pueda avanzar de uno en uno.
create or replace function public.facturacion_editable_touch_header()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    return new;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by, old.updated_by);
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger facturacion_borradores_touch
  before insert or update on public.facturacion_borradores
  for each row execute function public.facturacion_editable_touch_header();

create trigger facturacion_albaranes_touch
  before insert or update on public.facturacion_albaranes
  for each row execute function public.facturacion_editable_touch_header();

create or replace function public.facturacion_editable_touch_line()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    return new;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by, old.updated_by);
  return new;
end;
$$;

create trigger facturacion_borrador_lineas_touch
  before insert or update on public.facturacion_borrador_lineas
  for each row execute function public.facturacion_editable_touch_line();

create trigger facturacion_albaran_lineas_touch
  before insert or update on public.facturacion_albaran_lineas
  for each row execute function public.facturacion_editable_touch_line();

-- Una modificacion de linea tambien crea una nueva revision de la cabecera.
create or replace function public.facturacion_editable_bump_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_documento_id uuid;
begin
  -- En un borrado en cascada la cabecera ya se esta eliminando; no se intenta
  -- actualizarla, pero el trigger de auditoria de la linea conserva el OLD.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_table_name = 'facturacion_borrador_lineas' then
    v_documento_id := case when tg_op = 'DELETE' then old.borrador_id else new.borrador_id end;
    update public.facturacion_borradores
    set revision = revision + 1
    where id = v_documento_id;
  elsif tg_table_name = 'facturacion_albaran_lineas' then
    v_documento_id := case when tg_op = 'DELETE' then old.albaran_id else new.albaran_id end;
    update public.facturacion_albaranes
    set revision = revision + 1
    where id = v_documento_id;
  else
    raise exception 'Tabla no permitida para revision de facturacion editable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger facturacion_borrador_lineas_10_bump_parent
  after insert or update or delete on public.facturacion_borrador_lineas
  for each row execute function public.facturacion_editable_bump_parent();

create trigger facturacion_albaran_lineas_10_bump_parent
  after insert or update or delete on public.facturacion_albaran_lineas
  for each row execute function public.facturacion_editable_bump_parent();

-- Guarda old/new completos. Es SECURITY DEFINER porque authenticated no tiene
-- permiso de escritura directa sobre la auditoria.
create or replace function public.facturacion_auditar_editable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entidad_tipo text;
  v_entidad_id uuid;
  v_documento_id uuid;
  v_revision integer;
  v_accion text;
begin
  v_entidad_id := case when tg_op = 'DELETE' then old.id else new.id end;
  v_accion := case tg_op
    when 'INSERT' then 'creado'
    when 'UPDATE' then 'actualizado'
    when 'DELETE' then 'eliminado'
  end;

  if tg_table_name = 'facturacion_borradores' then
    v_entidad_tipo := 'borrador';
    v_documento_id := v_entidad_id;
    v_revision := case when tg_op = 'DELETE' then old.revision else new.revision end;
  elsif tg_table_name = 'facturacion_borrador_lineas' then
    v_entidad_tipo := 'borrador_linea';
    v_documento_id := case when tg_op = 'DELETE' then old.borrador_id else new.borrador_id end;
    select revision into v_revision
    from public.facturacion_borradores
    where id = v_documento_id;
  elsif tg_table_name = 'facturacion_albaranes' then
    v_entidad_tipo := 'albaran';
    v_documento_id := v_entidad_id;
    v_revision := case when tg_op = 'DELETE' then old.revision else new.revision end;
  elsif tg_table_name = 'facturacion_albaran_lineas' then
    v_entidad_tipo := 'albaran_linea';
    v_documento_id := case when tg_op = 'DELETE' then old.albaran_id else new.albaran_id end;
    select revision into v_revision
    from public.facturacion_albaranes
    where id = v_documento_id;
  else
    raise exception 'Tabla no permitida para auditoria de facturacion editable';
  end if;

  insert into public.facturacion_eventos_editables (
    entidad_tipo,
    entidad_id,
    documento_id,
    revision_documento,
    accion,
    datos_anteriores,
    datos_nuevos,
    actor_id
  ) values (
    v_entidad_tipo,
    v_entidad_id,
    v_documento_id,
    v_revision,
    v_accion,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger facturacion_borradores_20_audit
  after insert or update or delete on public.facturacion_borradores
  for each row execute function public.facturacion_auditar_editable();

create trigger facturacion_borrador_lineas_20_audit
  after insert or update or delete on public.facturacion_borrador_lineas
  for each row execute function public.facturacion_auditar_editable();

create trigger facturacion_albaranes_20_audit
  after insert or update or delete on public.facturacion_albaranes
  for each row execute function public.facturacion_auditar_editable();

create trigger facturacion_albaran_lineas_20_audit
  after insert or update or delete on public.facturacion_albaran_lineas
  for each row execute function public.facturacion_auditar_editable();

alter table public.facturacion_borradores enable row level security;
alter table public.facturacion_borrador_lineas enable row level security;
alter table public.facturacion_albaranes enable row level security;
alter table public.facturacion_albaran_lineas enable row level security;
alter table public.facturacion_eventos_editables enable row level security;

-- Una sola policy SELECT por tabla evita policies permisivas solapadas.
create policy "facturacion_borradores: operativa read"
  on public.facturacion_borradores for select
  using (public.is_admin() or public.es_responsable());
create policy "facturacion_borradores: admin insert"
  on public.facturacion_borradores for insert
  with check (public.is_admin());
create policy "facturacion_borradores: admin update"
  on public.facturacion_borradores for update
  using (public.is_admin()) with check (public.is_admin());
create policy "facturacion_borradores: admin delete"
  on public.facturacion_borradores for delete
  using (public.is_admin() and estado <> 'emitting');

create policy "facturacion_borrador_lineas: operativa read"
  on public.facturacion_borrador_lineas for select
  using (public.is_admin() or public.es_responsable());
create policy "facturacion_borrador_lineas: admin insert"
  on public.facturacion_borrador_lineas for insert
  with check (public.is_admin());
create policy "facturacion_borrador_lineas: admin update"
  on public.facturacion_borrador_lineas for update
  using (public.is_admin()) with check (public.is_admin());
create policy "facturacion_borrador_lineas: admin delete"
  on public.facturacion_borrador_lineas for delete
  using (public.is_admin());

create policy "facturacion_albaranes: operativa read"
  on public.facturacion_albaranes for select
  using (public.is_admin() or public.es_responsable());
create policy "facturacion_albaranes: admin insert"
  on public.facturacion_albaranes for insert
  with check (public.is_admin());
create policy "facturacion_albaranes: admin update"
  on public.facturacion_albaranes for update
  using (public.is_admin()) with check (public.is_admin());
create policy "facturacion_albaranes: admin delete"
  on public.facturacion_albaranes for delete
  using (public.is_admin() and estado_entrega = 'draft');

create policy "facturacion_albaran_lineas: operativa read"
  on public.facturacion_albaran_lineas for select
  using (public.is_admin() or public.es_responsable());
create policy "facturacion_albaran_lineas: admin insert"
  on public.facturacion_albaran_lineas for insert
  with check (public.is_admin());
create policy "facturacion_albaran_lineas: admin update"
  on public.facturacion_albaran_lineas for update
  using (public.is_admin()) with check (public.is_admin());
create policy "facturacion_albaran_lineas: admin delete"
  on public.facturacion_albaran_lineas for delete
  using (public.is_admin());

create policy "facturacion_eventos_editables: operativa read"
  on public.facturacion_eventos_editables for select
  using (public.is_admin() or public.es_responsable());

revoke all on public.facturacion_borradores from anon;
revoke all on public.facturacion_borrador_lineas from anon;
revoke all on public.facturacion_albaranes from anon;
revoke all on public.facturacion_albaran_lineas from anon;
revoke all on public.facturacion_eventos_editables from anon;

grant select, insert, update, delete on public.facturacion_borradores to authenticated;
grant select, insert, update, delete on public.facturacion_borrador_lineas to authenticated;
grant select, insert, update, delete on public.facturacion_albaranes to authenticated;
grant select, insert, update, delete on public.facturacion_albaran_lineas to authenticated;
grant select on public.facturacion_eventos_editables to authenticated;

grant all on public.facturacion_borradores to service_role;
grant all on public.facturacion_borrador_lineas to service_role;
grant all on public.facturacion_albaranes to service_role;
grant all on public.facturacion_albaran_lineas to service_role;
grant select on public.facturacion_eventos_editables to service_role;

grant usage, select on sequence public.facturacion_borradores_numero_interno_seq to authenticated;
grant usage, select on sequence public.facturacion_albaranes_numero_interno_seq to authenticated;
grant usage, select on sequence public.facturacion_borradores_numero_interno_seq to service_role;
grant usage, select on sequence public.facturacion_albaranes_numero_interno_seq to service_role;
grant usage, select on sequence public.facturacion_eventos_editables_id_seq to service_role;

revoke all on function public.facturacion_editable_bump_parent() from public, anon, authenticated;
revoke all on function public.facturacion_auditar_editable() from public, anon, authenticated;
revoke all on function public.facturacion_editable_touch_header() from public, anon, authenticated;
revoke all on function public.facturacion_editable_touch_line() from public, anon, authenticated;
