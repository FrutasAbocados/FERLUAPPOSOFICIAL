-- ============================================================================
-- RPCs atómicas para crear facturas Abuelo y Crédito (cabecera + líneas)
-- ============================================================================
-- Antes: el cliente hacía 2 mutations separadas (insert cabecera, luego insert
-- líneas) y si la 2ª fallaba intentaba "rollback manual" borrando la cabecera.
-- Si el rollback también fallaba (timeout, RLS, red), quedaba una factura
-- huérfana sin líneas. Estas RPCs hacen ambos pasos en una sola transacción
-- — si falla cualquier paso, Postgres revierte todo automáticamente.
--
-- Ambas son SECURITY DEFINER + chequeo explícito de rol admin (admin_full o
-- admin_op) en el cuerpo. Las líneas llegan como jsonb array.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Manager Abuelo (frutería propia) — crear factura con líneas
-- ---------------------------------------------------------------------------
create or replace function public.manager_abuelo_factura_create(
  p_fecha          date,
  p_numero_factura text,
  p_nota           text,
  p_lineas         jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     public.app_role;
  v_factura  uuid;
  v_total    numeric;
  v_subtotal numeric;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'p_lineas debe ser un array jsonb';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin_full', 'admin_op') then
    raise exception 'sólo admin_full o admin_op pueden crear facturas Abuelo' using errcode = '42501';
  end if;

  -- Total = suma(units * price). IVA 4% asumido para desglosar subtotal.
  select coalesce(sum((l->>'units')::numeric * (l->>'price')::numeric), 0)
    into v_total
  from jsonb_array_elements(p_lineas) l;
  v_subtotal := round(v_total / 1.04, 2);

  insert into public.manager_ventas_abuelo
    (fecha, numero_factura, nota, importe, subtotal, total, created_by)
  values
    (p_fecha, nullif(p_numero_factura, ''), nullif(p_nota, ''),
     v_total, v_subtotal, v_total, auth.uid())
  returning id into v_factura;

  insert into public.manager_lineas_abuelo (factura_id, product_id, nombre, units, price)
  select v_factura,
         nullif(l->>'product_id', ''),
         l->>'nombre',
         (l->>'units')::numeric,
         (l->>'price')::numeric
  from jsonb_array_elements(p_lineas) l;

  return v_factura;
end;
$$;

revoke all on function public.manager_abuelo_factura_create(date, text, text, jsonb) from public;
grant execute on function public.manager_abuelo_factura_create(date, text, text, jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- 2) Trabajadores Crédito — crear factura con líneas
-- ---------------------------------------------------------------------------
-- credito_lineas.subtotal es columna generada y un trigger recalcula
-- credito_facturas.total automáticamente — aquí basta con insertar.
create or replace function public.trabajadores_credito_factura_create(
  p_empleado_id uuid,
  p_fecha       date,
  p_nota        text,
  p_lineas      jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    public.app_role;
  v_factura uuid;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'p_lineas debe ser un array jsonb';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin_full', 'admin_op') then
    raise exception 'sólo admin_full o admin_op pueden crear facturas de crédito' using errcode = '42501';
  end if;

  insert into public.trabajadores_credito_facturas (empleado_id, fecha, nota, creado_por)
  values (p_empleado_id, p_fecha, nullif(p_nota, ''), auth.uid())
  returning id into v_factura;

  insert into public.trabajadores_credito_lineas (factura_id, product_id, nombre, units, price)
  select v_factura,
         nullif(l->>'product_id', ''),
         l->>'nombre',
         (l->>'units')::numeric,
         (l->>'price')::numeric
  from jsonb_array_elements(p_lineas) l;

  return v_factura;
end;
$$;

revoke all on function public.trabajadores_credito_factura_create(uuid, date, text, jsonb) from public;
grant execute on function public.trabajadores_credito_factura_create(uuid, date, text, jsonb) to authenticated;
