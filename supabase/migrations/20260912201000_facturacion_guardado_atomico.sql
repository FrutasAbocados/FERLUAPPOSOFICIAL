-- ============================================================================
-- Facturacion propia A5: guardado atomico de lineas revisadas
-- ============================================================================
-- Toda la correccion se aplica en una unica transaccion. Los triggers A3
-- conservan la revision de cabecera y la auditoria append-only de cada linea.
-- Esta funcion no emite documentos ni reserva numeracion fiscal.
-- ============================================================================

create or replace function public.facturacion_guardar_lineas(
  p_borrador_id uuid,
  p_lineas jsonb
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado text;
  v_esperadas integer;
  v_actualizadas integer;
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo administracion puede editar borradores' using errcode = '42501';
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Las lineas deben enviarse como una lista' using errcode = '22023';
  end if;

  v_esperadas := jsonb_array_length(p_lineas);
  if v_esperadas = 0 then
    raise exception 'No hay lineas para guardar' using errcode = '22023';
  end if;

  select b.estado
  into v_estado
  from public.facturacion_borradores b
  where b.id = p_borrador_id
  for update;

  if not found then
    raise exception 'Borrador no encontrado' using errcode = 'P0002';
  end if;

  if v_estado in ('emitting', 'cancelled') then
    raise exception 'El borrador ya no admite cambios' using errcode = '55000';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lineas) as x(
      id uuid,
      descripcion text,
      cantidad numeric,
      unidad text,
      precio_unitario numeric,
      descuento_pct numeric,
      iva_pct numeric,
      recargo_equivalencia_pct numeric
    )
    where x.id is null
      or btrim(coalesce(x.descripcion, '')) = ''
      or x.cantidad is null or x.cantidad <= 0
      or btrim(coalesce(x.unidad, '')) = ''
      or x.precio_unitario < 0
      or x.descuento_pct is null or x.descuento_pct < 0 or x.descuento_pct > 100
      or x.iva_pct is null or x.iva_pct < 0 or x.iva_pct > 100
      or x.recargo_equivalencia_pct is null
      or x.recargo_equivalencia_pct < 0 or x.recargo_equivalencia_pct > 100
  ) then
    raise exception 'Hay lineas con datos invalidos' using errcode = '22023';
  end if;

  if (
    select count(distinct x.id)
    from jsonb_to_recordset(p_lineas) as x(id uuid)
  ) <> v_esperadas then
    raise exception 'Hay lineas repetidas o sin identificador' using errcode = '22023';
  end if;

  with cambios as (
    select *
    from jsonb_to_recordset(p_lineas) as x(
      id uuid,
      descripcion text,
      cantidad numeric,
      unidad text,
      precio_unitario numeric,
      descuento_pct numeric,
      iva_pct numeric,
      recargo_equivalencia_pct numeric
    )
  ), actualizadas as (
    update public.facturacion_borrador_lineas l
    set descripcion = btrim(c.descripcion),
        cantidad = c.cantidad,
        unidad = btrim(c.unidad),
        precio_unitario = c.precio_unitario,
        precio_estado = case when c.precio_unitario is null then 'pendiente' else 'manual' end,
        precio_fuente = case when c.precio_unitario is null then null else 'manual' end,
        precio_fecha = case
          when c.precio_unitario is null then null
          else (now() at time zone 'Europe/Madrid')::date
        end,
        descuento_pct = c.descuento_pct,
        iva_pct = c.iva_pct,
        recargo_equivalencia_pct = c.recargo_equivalencia_pct
    from cambios c
    where l.id = c.id
      and l.borrador_id = p_borrador_id
    returning l.id
  )
  select count(*) into v_actualizadas from actualizadas;

  if v_actualizadas <> v_esperadas then
    raise exception 'Alguna linea no pertenece al borrador' using errcode = '22023';
  end if;

  return public.facturacion_recalcular_borrador_estado(p_borrador_id);
end;
$$;

comment on function public.facturacion_guardar_lineas(uuid, jsonb) is
  'Guarda atomica y auditadamente las lineas revisadas de un borrador A5.';

revoke all on function public.facturacion_guardar_lineas(uuid, jsonb) from public, anon;
grant execute on function public.facturacion_guardar_lineas(uuid, jsonb) to authenticated, service_role;
