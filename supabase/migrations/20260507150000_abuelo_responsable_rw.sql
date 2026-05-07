-- Permite al rol `responsable` (Raúl) crear y borrar facturas Abuelo.
-- Antes solo admin_full y admin_op podían escribir.
-- Cambios:
--   1. Policy responsable rw en manager_ventas_abuelo + manager_lineas_abuelo.
--   2. Validación interna de la RPC manager_abuelo_factura_create amplia a 'responsable'.

drop policy if exists "manager_ventas_abuelo: responsable rw" on public.manager_ventas_abuelo;
create policy "manager_ventas_abuelo: responsable rw"
  on public.manager_ventas_abuelo for all
  using (es_responsable())
  with check (es_responsable());

drop policy if exists "manager_lineas_abuelo: responsable rw" on public.manager_lineas_abuelo;
create policy "manager_lineas_abuelo: responsable rw"
  on public.manager_lineas_abuelo for all
  using (es_responsable())
  with check (es_responsable());

create or replace function public.manager_abuelo_factura_create(p_fecha date, p_numero_factura text, p_nota text, p_lineas jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role     public.app_role;
  v_factura  uuid;
  v_subtotal numeric;
  v_total    numeric;
  v_contact  text := public.abuelo_contact_name();
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'p_lineas debe ser un array jsonb';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin_full', 'admin_op', 'responsable') then
    raise exception 'sólo admin_full, admin_op o responsable pueden crear facturas Abuelo' using errcode = '42501';
  end if;

  select coalesce(sum((l->>'units')::numeric * (l->>'price')::numeric), 0),
         coalesce(sum((l->>'units')::numeric * (l->>'price')::numeric
                      * (1 + coalesce((l->>'tax_rate')::numeric, 4) / 100.0)), 0)
    into v_subtotal, v_total
  from jsonb_array_elements(p_lineas) l;

  v_subtotal := round(v_subtotal::numeric, 2);
  v_total    := round(v_total::numeric, 2);

  insert into public.manager_ventas_abuelo
    (fecha, numero_factura, nota, importe, subtotal, total, created_by)
  values
    (p_fecha, nullif(p_numero_factura, ''), nullif(p_nota, ''),
     v_total, v_subtotal, v_total, auth.uid())
  returning id into v_factura;

  insert into public.manager_lineas_abuelo (factura_id, product_id, nombre, units, price, tax_rate)
  select v_factura,
         nullif(l->>'product_id', ''),
         l->>'nombre',
         (l->>'units')::numeric,
         (l->>'price')::numeric,
         coalesce((l->>'tax_rate')::numeric, 4)
  from jsonb_array_elements(p_lineas) l;

  insert into public.manager_facturas
    (id, tipo, subtipo, doc_number, contact_id, contact_name,
     fecha, fecha_vencimiento, descripcion,
     subtotal, impuestos, descuento, total, status,
     payments_total, payments_pending, payments_refunds,
     currency, tags, raw, updated_at)
  values
    (v_factura::text, 'VENTA', 'abuelo', nullif(p_numero_factura, ''),
     'abuelo', v_contact,
     p_fecha, p_fecha, nullif(p_nota, ''),
     v_subtotal, v_total - v_subtotal, 0, v_total, 1,
     v_total, 0, 0,
     'EUR', null, jsonb_build_object('source', 'abuelo'), now());

  insert into public.manager_lineas
    (id, factura_id, tipo, subtipo, fecha, contact_id, nombre, nombre_raw,
     descripcion, sku, product_id, variant_id, cuenta,
     units, price, cost_price, tax_rate, discount, raw)
  select 'L' || (idx - 1)::text,
         v_factura::text,
         'VENTA',
         'abuelo',
         p_fecha,
         'abuelo',
         l->>'nombre',
         l->>'nombre',
         null, null, nullif(l->>'product_id', ''), null, null,
         (l->>'units')::numeric,
         (l->>'price')::numeric,
         null,
         coalesce((l->>'tax_rate')::numeric, 4),
         0,
         l
  from jsonb_array_elements(p_lineas) with ordinality as t(l, idx);

  return v_factura;
end;
$function$;
