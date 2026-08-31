-- Crédito de fruta autoservicio:
-- el trabajador declara artículo + peso y un admin asigna €/kg al aprobar.
-- Las facturas históricas se consideran aprobadas y conservan sus importes.

alter table public.trabajadores_credito_facturas
  add column if not exists estado text not null default 'aprobada'
    check (estado in ('pendiente', 'aprobada', 'rechazada')),
  add column if not exists resuelta_por uuid references auth.users(id),
  add column if not exists resuelta_at timestamptz,
  add column if not exists motivo_rechazo text;

create index if not exists trab_credito_facturas_estado_fecha_idx
  on public.trabajadores_credito_facturas (estado, fecha desc);

comment on column public.trabajadores_credito_facturas.estado is
  'pendiente: declarada por trabajador; aprobada: precio asignado y descuenta crédito; rechazada: no descuenta.';

create or replace function public.trabajadores_credito_solicitar(
  p_fecha date,
  p_nota text,
  p_lineas jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empleado uuid;
  v_nombre text;
  v_factura uuid;
begin
  select e.id, e.nombre
    into v_empleado, v_nombre
  from public.empleados e
  where e.user_id = auth.uid()
    and e.activo = true
    and e.pack in (1, 3)
  limit 1;

  if v_empleado is null then
    raise exception 'Tu usuario no está vinculado a un trabajador activo con crédito de fruta'
      using errcode = '42501';
  end if;

  if p_fecha is null or p_fecha > current_date then
    raise exception 'La fecha no puede estar vacía ni ser futura' using errcode = '22023';
  end if;

  if p_lineas is null
    or jsonb_typeof(p_lineas) <> 'array'
    or jsonb_array_length(p_lineas) = 0
    or jsonb_array_length(p_lineas) > 20 then
    raise exception 'Añade entre 1 y 20 artículos' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lineas) l
    where nullif(trim(l->>'nombre'), '') is null
      or coalesce((l->>'units')::numeric, 0) <= 0
      or char_length(trim(l->>'nombre')) > 160
      or (l->>'units')::numeric > 1000
  ) then
    raise exception 'Cada línea necesita artículo y un peso válido mayor que 0' using errcode = '22023';
  end if;

  insert into public.trabajadores_credito_facturas
    (empleado_id, fecha, nota, creado_por, estado)
  values
    (v_empleado, p_fecha, nullif(trim(p_nota), ''), auth.uid(), 'pendiente')
  returning id into v_factura;

  insert into public.trabajadores_credito_lineas
    (factura_id, product_id, nombre, units, price)
  select
    v_factura,
    nullif(l->>'product_id', ''),
    trim(l->>'nombre'),
    (l->>'units')::numeric,
    0
  from jsonb_array_elements(p_lineas) l;

  insert into public.notificaciones (audience, empleado_id, tipo, titulo, cuerpo, payload)
  values (
    'admin',
    v_empleado,
    'credito_fruta',
    'Nueva solicitud de fruta y verdura',
    coalesce(v_nombre, 'Un trabajador') || ' ha apuntado ' ||
      jsonb_array_length(p_lineas)::text || ' artículo(s)',
    jsonb_build_object(
      'url', '/trabajadores?tab=credito',
      'empleado_id', v_empleado,
      'factura_id', v_factura
    )
  );

  return v_factura;
end;
$function$;

create or replace function public.trabajadores_credito_cancelar_propia(
  p_factura_id uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empleado uuid;
begin
  select e.id into v_empleado
  from public.empleados e
  where e.user_id = auth.uid()
    and e.activo = true
  limit 1;

  if v_empleado is null then
    raise exception 'Tu usuario no está vinculado a un trabajador activo' using errcode = '42501';
  end if;

  delete from public.trabajadores_credito_facturas
  where id = p_factura_id
    and empleado_id = v_empleado
    and estado = 'pendiente';

  if not found then
    raise exception 'La solicitud no existe o ya ha sido resuelta' using errcode = '42501';
  end if;

  delete from public.notificaciones
  where audience = 'admin'
    and payload->>'factura_id' = p_factura_id::text;
end;
$function$;

create or replace function public.trabajadores_credito_resolver(
  p_factura_id uuid,
  p_aprobar boolean,
  p_lineas jsonb default '[]'::jsonb,
  p_motivo_rechazo text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_empleado uuid;
  v_fecha date;
  v_total numeric;
  v_lineas_factura integer;
  v_lineas_recibidas integer;
  v_actualizadas integer;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede resolver solicitudes' using errcode = '42501';
  end if;

  select f.empleado_id, f.fecha
    into v_empleado, v_fecha
  from public.trabajadores_credito_facturas f
  where f.id = p_factura_id
    and f.estado = 'pendiente'
  for update;

  if v_empleado is null then
    raise exception 'La solicitud no existe o ya ha sido resuelta' using errcode = '42704';
  end if;

  delete from public.notificaciones
  where audience = 'admin'
    and payload->>'factura_id' = p_factura_id::text;

  if p_aprobar then
    if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
      raise exception 'Los precios deben enviarse como un array' using errcode = '22023';
    end if;

    select count(*) into v_lineas_factura
    from public.trabajadores_credito_lineas l
    where l.factura_id = p_factura_id;

    select count(*), count(distinct x.id)
      into v_lineas_recibidas, v_actualizadas
    from jsonb_to_recordset(p_lineas) as x(id uuid, price numeric);

    if v_lineas_factura = 0
      or v_lineas_recibidas <> v_lineas_factura
      or v_actualizadas <> v_lineas_factura
      or exists (
        select 1
        from jsonb_to_recordset(p_lineas) as x(id uuid, price numeric)
        where x.price is null or x.price <= 0
      )
      or exists (
        select 1
        from jsonb_to_recordset(p_lineas) as x(id uuid, price numeric)
        where not exists (
          select 1
          from public.trabajadores_credito_lineas l
          where l.id = x.id and l.factura_id = p_factura_id
        )
      ) then
      raise exception 'Asigna un precio €/kg mayor que 0 a todos los artículos' using errcode = '22023';
    end if;

    update public.trabajadores_credito_lineas l
    set price = x.price
    from jsonb_to_recordset(p_lineas) as x(id uuid, price numeric)
    where l.id = x.id
      and l.factura_id = p_factura_id;

    get diagnostics v_actualizadas = row_count;
    if v_actualizadas <> v_lineas_factura then
      raise exception 'No se pudieron asignar todos los precios' using errcode = '22023';
    end if;

    update public.trabajadores_credito_facturas
    set estado = 'aprobada',
        resuelta_por = auth.uid(),
        resuelta_at = now(),
        motivo_rechazo = null
    where id = p_factura_id;

    select f.total into v_total
    from public.trabajadores_credito_facturas f
    where f.id = p_factura_id;

    insert into public.notificaciones (audience, empleado_id, tipo, titulo, cuerpo, payload)
    values (
      'empleado',
      v_empleado,
      'credito_fruta',
      'Solicitud de fruta aprobada',
      to_char(v_fecha, 'DD/MM') || ' · ' || trim(to_char(v_total, 'FM999990.00')) || ' €',
      jsonb_build_object('url', '/trabajadores?tab=credito', 'factura_id', p_factura_id)
    );
  else
    update public.trabajadores_credito_facturas
    set estado = 'rechazada',
        resuelta_por = auth.uid(),
        resuelta_at = now(),
        motivo_rechazo = nullif(trim(p_motivo_rechazo), '')
    where id = p_factura_id;

    insert into public.notificaciones (audience, empleado_id, tipo, titulo, cuerpo, payload)
    values (
      'empleado',
      v_empleado,
      'credito_fruta',
      'Solicitud de fruta rechazada',
      to_char(v_fecha, 'DD/MM') || coalesce(' · ' || nullif(trim(p_motivo_rechazo), ''), ''),
      jsonb_build_object('url', '/trabajadores?tab=credito', 'factura_id', p_factura_id)
    );
  end if;
end;
$function$;

create or replace function public.trabajadores_credito_solicitudes_pendientes()
returns table (
  id uuid,
  empleado_id uuid,
  empleado_nombre text,
  fecha date,
  nota text,
  created_at timestamptz,
  lineas jsonb
)
language sql
security invoker
stable
set search_path to 'public'
as $function$
  select
    f.id,
    f.empleado_id,
    e.nombre as empleado_nombre,
    f.fecha,
    f.nota,
    f.created_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'product_id', l.product_id,
          'nombre', l.nombre,
          'units', l.units,
          'price', l.price
        )
        order by l.created_at
      )
      from public.trabajadores_credito_lineas l
      where l.factura_id = f.id
    ), '[]'::jsonb) as lineas
  from public.trabajadores_credito_facturas f
  join public.empleados e on e.id = f.empleado_id
  where f.estado = 'pendiente'
    and public.is_admin()
  order by f.created_at;
$function$;

revoke all on function public.trabajadores_credito_solicitar(date, text, jsonb) from public;
revoke all on function public.trabajadores_credito_cancelar_propia(uuid) from public;
revoke all on function public.trabajadores_credito_resolver(uuid, boolean, jsonb, text) from public;
revoke all on function public.trabajadores_credito_solicitudes_pendientes() from public;

grant execute on function public.trabajadores_credito_solicitar(date, text, jsonb) to authenticated;
grant execute on function public.trabajadores_credito_cancelar_propia(uuid) to authenticated;
grant execute on function public.trabajadores_credito_resolver(uuid, boolean, jsonb, text) to authenticated;
grant execute on function public.trabajadores_credito_solicitudes_pendientes() to authenticated;
