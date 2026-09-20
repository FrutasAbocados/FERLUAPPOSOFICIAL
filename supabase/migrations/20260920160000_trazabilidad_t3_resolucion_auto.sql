-- T3 · Resolucion automatica de trazabilidad con control de saldo.
--
-- Dos hechos medidos sobre los datos reales obligan a corregir el diseno de T2:
--
--  1. Solo el 42% de las lineas de venta tienen compra del mismo producto en la
--     MISMA unidad (se vende "caja" y se compra "kg" o "bulto"). Con imputacion
--     por cantidad estricta, la mitad de las lineas se quedaria sin trazar.
--  2. Solo 11 de 184 alias de compra tienen factor de unidad, asi que convertir
--     caja->kg seria inventar la mayor parte de las veces.
--
-- La ley (Reglamento 178/2002, art. 18) pide identificar de quien viene el
-- producto que se vende, no cuadrar un inventario. El balance de masas es un
-- control extra, posible solo cuando las unidades son comparables. Por eso la
-- traza pasa a tener dos alcances:
--   - 'cantidad': imputa kg/unidades concretas y consume saldo de la compra.
--   - 'lote': identifica la compra y su lote, sin cantidad, cuando las unidades
--     no son comparables. Sigue siendo trazabilidad; no es balance.

alter table public.facturacion_linea_trazas
  add column if not exists alcance text not null default 'cantidad'
    check (alcance in ('cantidad', 'lote'));

alter table public.facturacion_linea_trazas alter column cantidad_imputada drop not null;
alter table public.facturacion_linea_trazas alter column unidad drop not null;

alter table public.facturacion_linea_trazas
  drop constraint if exists facturacion_linea_trazas_alcance_coherente;
alter table public.facturacion_linea_trazas
  add constraint facturacion_linea_trazas_alcance_coherente check (
    (alcance = 'cantidad' and cantidad_imputada is not null and unidad is not null)
    or
    (alcance = 'lote' and cantidad_imputada is null and unidad is null)
  );

-- El emparejamiento entra por el nombre normalizado de la compra. Sin este
-- indice la resolucion recorre las 9.948 lineas de compra en cada linea de
-- venta (medido: la consulta se pasaba de 120 s).
create index if not exists idx_pedidos_wa_compras_lineas_nombre_norm
  on public.pedidos_wa_compras_lineas ((public.manager_norm_nombre(descripcion)));

-- Las vistas se recrean, no se reemplazan: `select t.*` congelo su lista de
-- columnas al crearse y `create or replace` no puede anadir `alcance` en medio.
drop view if exists public.facturacion_linea_traza_estado;
drop view if exists public.facturacion_compra_linea_saldo;
drop view if exists public.facturacion_linea_trazas_vigentes;

create view public.facturacion_linea_trazas_vigentes
with (security_invoker = on)
as
select t.*
from public.facturacion_linea_trazas t
where t.anula_traza_id is null
  and not exists (
    select 1 from public.facturacion_linea_trazas a
    where a.anula_traza_id = t.id
  );

alter view public.facturacion_linea_trazas_vigentes owner to postgres;
revoke all on public.facturacion_linea_trazas_vigentes from anon;
grant select on public.facturacion_linea_trazas_vigentes to authenticated, service_role;

-- Estado por linea, ahora con los dos alcances y con la confianza peor, no la
-- primera por orden alfabetico ('alta' < 'baja' < 'media' ordenaba al reves).
create view public.facturacion_linea_traza_estado
with (security_invoker = on)
as
select
  l.id           as borrador_linea_id,
  l.borrador_id,
  l.descripcion,
  l.cantidad,
  l.unidad,
  coalesce(sum(t.cantidad_imputada)
    filter (where t.alcance = 'cantidad' and t.unidad = l.unidad), 0)::numeric(12,3)
    as cantidad_trazada,
  case
    when count(t.id) = 0 then 'sin_traza'
    when coalesce(sum(t.cantidad_imputada)
           filter (where t.alcance = 'cantidad' and t.unidad = l.unidad), 0) + 0.001
         >= l.cantidad then 'completa'
    when count(t.id) filter (where t.alcance = 'lote') > 0 then 'lote_sin_cantidad'
    else 'parcial'
  end as estado_traza,
  count(t.id) as n_trazas,
  case
    when count(t.id) filter (where t.confianza = 'baja')  > 0 then 'baja'
    when count(t.id) filter (where t.confianza = 'media') > 0 then 'media'
    when count(t.id) > 0 then 'alta'
  end as confianza_peor
from public.facturacion_borrador_lineas l
left join public.facturacion_linea_trazas_vigentes t
  on t.borrador_linea_id = l.id
group by l.id, l.borrador_id, l.descripcion, l.cantidad, l.unidad;

-- El saldo solo lo consume la imputacion por cantidad en la misma unidad.
create view public.facturacion_compra_linea_saldo
with (security_invoker = on)
as
select
  cl.id          as compra_linea_id,
  cl.compra_id,
  c.fecha        as fecha_compra,
  c.proveedor_nombre,
  c.num_factura,
  cl.descripcion,
  cl.lote,
  cl.origen,
  cl.unidad,
  cl.cantidad,
  coalesce(sum(t.cantidad_imputada), 0)::numeric(12,3) as cantidad_imputada,
  (cl.cantidad - coalesce(sum(t.cantidad_imputada), 0))::numeric(12,3) as cantidad_disponible
from public.pedidos_wa_compras_lineas cl
join public.pedidos_wa_compras c on c.id = cl.compra_id
left join public.facturacion_linea_trazas_vigentes t
  on t.compra_linea_id = cl.id
 and t.alcance = 'cantidad'
 and t.unidad = cl.unidad
group by cl.id, cl.compra_id, c.fecha, c.proveedor_nombre, c.num_factura,
         cl.descripcion, cl.lote, cl.origen, cl.unidad, cl.cantidad;

grant select on public.facturacion_linea_traza_estado to authenticated, service_role;
grant select on public.facturacion_compra_linea_saldo to authenticated, service_role;

-- Resolucion automatica de un borrador.
--
-- Orden de imputacion: compra MAS RECIENTE primero, no FIFO literal. En fruta y
-- verdura sin sistema de stock, FIFO asignaria siempre la compra mas vieja de la
-- ventana, que es justo la que ya se vendio. Lo defendible es que lo vendido hoy
-- salio de lo comprado en los dias inmediatamente anteriores. El saldo impide
-- que una compra se impute mas veces de lo que se compro.
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
as $$
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
  if not is_admin() then
    raise exception 'Solo administracion puede trazar borradores' using errcode = '42501';
  end if;
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
      select s.*, min(n.confianza) as confianza
      from public.facturacion_compra_linea_saldo s
      join nombres n on n.nom = public.manager_norm_nombre(s.descripcion)
      where s.unidad = v_linea.unidad
        and s.cantidad_disponible > 0.001
        and s.fecha_compra between v_fecha - p_ventana_dias and v_fecha
      group by s.compra_linea_id, s.compra_id, s.fecha_compra, s.proveedor_nombre,
               s.num_factura, s.descripcion, s.lote, s.origen, s.unidad,
               s.cantidad, s.cantidad_imputada, s.cantidad_disponible
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
$$;

revoke execute on function public.facturacion_trazar_borrador(uuid, integer) from public, anon;
grant execute on function public.facturacion_trazar_borrador(uuid, integer) to authenticated, service_role;
