-- T6 · La trazabilidad se resuelve sola al crear el borrador.
--
-- Hasta ahora habia que pulsar "Trazar automatico" en cada borrador, y T4
-- bloquea el cierre de cualquiera que no lo tenga: con 0 trazas en produccion,
-- el primer cierre real iba a rebotar.
--
-- La logica de T3 pasa a un worker interno sin comprobacion de rol. El RPC
-- publico conserva su contrato (solo administracion) y lo envuelve. Un trigger
-- por sentencia sobre las lineas del borrador lo lanza tras cada alta: A4
-- inserta todas las lineas en un solo INSERT ... SELECT, asi que se traza el
-- borrador entero una vez.
--
-- Regla de A4 que se respeta: nada puede bloquear el pedido ni la creacion del
-- borrador. Si la resolucion falla, se absorbe el error; el borrador nace igual
-- y aparece como SIN TRAZA en la bandeja, que ya es la senal visible.
--
-- Sin backfill: los borradores anteriores se trazan con el boton, como se
-- decidio al empezar.

create or replace function public.facturacion_trazar_borrador_interno(
  p_borrador_id  uuid,
  p_ventana_dias integer default 15
)
returns table (
  borrador_linea_id uuid,
  descripcion       text,
  cantidad          numeric,
  unidad            text,
  estado_traza      text,
  trazas_creadas    integer,
  detalle           text
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_fecha     date;
  v_cerrado   boolean;
  v_linea     record;
  v_cand      record;
  v_pendiente numeric;
  v_imputar   numeric;
  v_creadas   integer;
  v_detalle   text;
begin
  if p_ventana_dias is null or p_ventana_dias < 1 or p_ventana_dias > 120 then
    raise exception 'Ventana fuera de rango (1-120 dias)' using errcode = '22023';
  end if;

  select coalesce(b.fecha_operacion, b.fecha_expedicion_prevista, current_date)
  into v_fecha
  from public.facturacion_borradores b
  where b.id = p_borrador_id;
  if v_fecha is null then
    raise exception 'El borrador % no existe', p_borrador_id using errcode = '23503';
  end if;

  select e.accion = 'cerrado'
  into v_cerrado
  from public.facturacion_revision_sombra_eventos e
  where e.borrador_id = p_borrador_id
  order by e.secuencia desc
  limit 1;
  if coalesce(v_cerrado, false) then
    raise exception 'La revision sombra esta cerrada: reabrela antes de trazar'
      using errcode = '55000';
  end if;

  for v_linea in
    select l.id, l.descripcion, l.cantidad, l.unidad, l.producto_referencia,
           e.estado_traza, e.cantidad_trazada
    from public.facturacion_borrador_lineas l
    join public.facturacion_linea_traza_estado e on e.borrador_linea_id = l.id
    where l.borrador_id = p_borrador_id
      and e.estado_traza in ('sin_traza', 'parcial')
      and l.cantidad > 0
    order by l.orden
  loop
    v_creadas   := 0;
    v_detalle   := null;
    v_pendiente := v_linea.cantidad - coalesce(v_linea.cantidad_trazada, 0);

    -- 1. Imputacion por cantidad: misma unidad y con saldo disponible.
    for v_cand in
      with nombres as (
        select public.manager_norm_nombre(a.nombre_compra_norm) as nom,
               'alta'::text as confianza
        from public.manager_compra_alias a
        where a.activo
          and a.holded_product_id = v_linea.producto_referencia
          and a.holded_product_id <> '0'
          and v_linea.producto_referencia is not null
        union
        select public.manager_norm_nombre(v_linea.descripcion), 'media'::text
      )
      select s.compra_linea_id, s.compra_id, s.fecha_compra, s.proveedor_nombre,
             s.num_factura, s.descripcion, s.lote, s.origen, s.unidad,
             s.cantidad_disponible, min(n.confianza) as confianza
      from public.facturacion_compra_linea_saldo s
      join nombres n on n.nom = public.manager_norm_nombre(s.descripcion)
      where s.unidad = v_linea.unidad
        and s.cantidad_disponible > 0.001
        and s.fecha_compra between v_fecha - p_ventana_dias and v_fecha
      group by s.compra_linea_id, s.compra_id, s.fecha_compra, s.proveedor_nombre,
               s.num_factura, s.descripcion, s.lote, s.origen, s.unidad,
               s.cantidad_disponible
      order by s.fecha_compra desc, s.compra_linea_id
    loop
      exit when v_pendiente <= 0.001;
      v_imputar := least(v_pendiente, v_cand.cantidad_disponible);

      insert into public.facturacion_linea_trazas (
        borrador_linea_id, borrador_id, fuente, compra_id, compra_linea_id,
        alcance, cantidad_imputada, unidad, lote, origen, proveedor_nombre,
        num_factura, fecha_compra, descripcion_compra, metodo, confianza
      ) values (
        v_linea.id, p_borrador_id, 'compra_wa', v_cand.compra_id, v_cand.compra_linea_id,
        'cantidad', v_imputar, v_cand.unidad, v_cand.lote, v_cand.origen,
        v_cand.proveedor_nombre, v_cand.num_factura, v_cand.fecha_compra,
        v_cand.descripcion, 'auto_fifo', v_cand.confianza
      );

      v_pendiente := v_pendiente - v_imputar;
      v_creadas   := v_creadas + 1;
    end loop;

    -- 2. Sin unidad comparable: enlace por lote, sin cantidad y sin consumir saldo.
    if v_creadas = 0 then
      with nombres as (
        select public.manager_norm_nombre(a.nombre_compra_norm) as nom
        from public.manager_compra_alias a
        where a.activo
          and a.holded_product_id = v_linea.producto_referencia
          and a.holded_product_id <> '0'
          and v_linea.producto_referencia is not null
        union
        select public.manager_norm_nombre(v_linea.descripcion)
      )
      select cl.id as compra_linea_id, cl.compra_id, cl.lote, cl.origen,
             cl.descripcion, c.proveedor_nombre, c.num_factura, c.fecha
      into v_cand
      from public.pedidos_wa_compras_lineas cl
      join public.pedidos_wa_compras c on c.id = cl.compra_id
      join nombres n on n.nom = public.manager_norm_nombre(cl.descripcion)
      where c.fecha between v_fecha - p_ventana_dias and v_fecha
      order by c.fecha desc, cl.id
      limit 1;

      if v_cand.compra_linea_id is not null then
        insert into public.facturacion_linea_trazas (
          borrador_linea_id, borrador_id, fuente, compra_id, compra_linea_id,
          alcance, lote, origen, proveedor_nombre, num_factura, fecha_compra,
          descripcion_compra, metodo, confianza
        ) values (
          v_linea.id, p_borrador_id, 'compra_wa', v_cand.compra_id, v_cand.compra_linea_id,
          'lote', v_cand.lote, v_cand.origen, v_cand.proveedor_nombre,
          v_cand.num_factura, v_cand.fecha, v_cand.descripcion, 'auto_fifo', 'media'
        );
        v_creadas := 1;
        v_detalle := 'unidades no comparables (' || v_linea.unidad
                     || ' vendida): enlace al lote sin cantidad';
      else
        v_detalle := 'sin compra del producto en los ' || p_ventana_dias || ' dias previos';
      end if;
    elsif v_pendiente > 0.001 then
      v_detalle := 'quedan ' || round(v_pendiente, 3) || ' ' || v_linea.unidad
                   || ' sin saldo de compra disponible';
    end if;

    return query
      select v_linea.id, v_linea.descripcion, v_linea.cantidad, v_linea.unidad,
             e.estado_traza, v_creadas, v_detalle
      from public.facturacion_linea_traza_estado e
      where e.borrador_linea_id = v_linea.id;
  end loop;
end;
$fn$;

revoke all on function public.facturacion_trazar_borrador_interno(uuid, integer)
  from public, anon, authenticated, service_role;

create or replace function public.facturacion_trazar_borrador(
  p_borrador_id  uuid,
  p_ventana_dias integer default 15
)
returns table (
  borrador_linea_id uuid,
  descripcion       text,
  cantidad          numeric,
  unidad            text,
  estado_traza      text,
  trazas_creadas    integer,
  detalle           text
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not is_admin() then
    raise exception 'Solo administracion puede trazar borradores' using errcode = '42501';
  end if;
  return query
    select * from public.facturacion_trazar_borrador_interno(p_borrador_id, p_ventana_dias);
end;
$fn$;

revoke execute on function public.facturacion_trazar_borrador(uuid, integer) from public, anon;
grant execute on function public.facturacion_trazar_borrador(uuid, integer) to authenticated, service_role;

create or replace function public.facturacion_lineas_trazar_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_borrador uuid;
begin
  for v_borrador in select distinct n.borrador_id from nuevas n loop
    begin
      perform 1 from public.facturacion_trazar_borrador_interno(v_borrador, 15);
    exception when others then
      raise warning 'Trazabilidad automatica fallida en borrador %: % %',
        v_borrador, sqlstate, sqlerrm;
    end;
  end loop;
  return null;
end;
$fn$;

revoke all on function public.facturacion_lineas_trazar_auto()
  from public, anon, authenticated, service_role;

create or replace trigger facturacion_borrador_lineas_zz_trazar_auto
  after insert on public.facturacion_borrador_lineas
  referencing new table as nuevas
  for each statement execute function public.facturacion_lineas_trazar_auto();
