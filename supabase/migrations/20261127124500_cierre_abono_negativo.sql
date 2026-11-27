-- Abonos en el cierre de reparto (27-nov, caso MOOSA BAY A263031 = −30,66 €).
-- Un albarán de Holded puede salir en negativo cuando descuenta una devolución.
-- Las líneas en «deuda» admiten ese negativo para que el cierre cuadre con Holded;
-- efectivo y tarjeta siguen sin admitir negativos.
-- Cobros ya acepta abonos (20260428510000_cobros_permitir_abonos): el volcado de
-- deuda y los descuadres pasan de «importe > 0» a «importe <> 0». Resto igual que producción.

alter table public.repartos_jornada_lineas
  drop constraint if exists repartos_jornada_lineas_importe_check;
alter table public.repartos_jornada_lineas
  add constraint repartos_jornada_lineas_importe_check
  check (importe >= 0 or forma_pago = 'deuda');

CREATE OR REPLACE FUNCTION public.repartos_jornada_volcar_deuda(p_jornada_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fecha  date;
  r        record;
  v_doc    text;
  v_cli    uuid;
  n_nuevas int := 0;
  n_ya     int := 0;
  n_desc   int := 0;
begin
  if not public.is_admin() then
    raise exception 'solo administración puede pasar deuda a Cobros';
  end if;

  update public.repartos_jornada
     set deuda_cobros_at = coalesce(deuda_cobros_at, now())
   where id = p_jornada_id
  returning fecha into v_fecha;
  if not found then raise exception 'jornada no encontrada'; end if;

  for r in
    select l.contact_id, l.contact_nombre, l.importe,
           public.repartos_linea_contact_key(l.contact_id, l.contact_nombre) as k
      from public.repartos_jornada_lineas l
     where l.jornada_id = p_jornada_id
       and l.forma_pago = 'deuda'
       and not l.cobro_anterior
       and l.importe <> 0
     order by l.orden
  loop
    if exists (select 1 from public.cobros_cierre_cuadres c
                where c.jornada_id = p_jornada_id and c.contact_key = r.k and c.importe = r.importe) then
      n_ya := n_ya + 1; continue;
    end if;

    select f.doc_number into v_doc
      from public.manager_facturas f
     where f.tipo = 'VENTA'
       and f.contact_id = r.contact_id
       and f.fecha between v_fecha - 1 and v_fecha + 1
       and abs(f.total - r.importe) < 0.02
     order by exists (select 1 from public.cobros_movimientos m where m.numero_factura = f.doc_number),
              abs(f.fecha - v_fecha), f.doc_number
     limit 1;

    if v_doc is null then n_desc := n_desc + 1; continue; end if;
    if exists (select 1 from public.cobros_movimientos m where m.numero_factura = v_doc) then
      n_ya := n_ya + 1; continue;
    end if;

    select cliente_id into v_cli from public.cobros_cliente_enlace where contact_id = r.contact_id;
    if v_cli is null then n_desc := n_desc + 1; continue; end if;

    if public.cobros_insertar_factura_venta(v_doc, v_cli, p_jornada_id, 'Cierre de reparto') then
      n_nuevas := n_nuevas + 1;
    else
      n_ya := n_ya + 1;
    end if;
  end loop;

  return jsonb_build_object('nuevas', n_nuevas, 'ya_estaban', n_ya, 'descuadres', n_desc);
end;
$function$;

CREATE OR REPLACE FUNCTION public.cobros_cierre_descuadres()
 RETURNS TABLE(jornada_id uuid, fecha date, repartidor text, contact_id text, contact_nombre text, contact_key text, importe numeric, motivo text, cliente_id uuid, candidatas jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with lin as (
    select j.id as jornada_id, j.fecha, e.nombre as repartidor,
           l.contact_id, l.contact_nombre, l.importe,
           public.repartos_linea_contact_key(l.contact_id, l.contact_nombre) as k
      from public.repartos_jornada j
      join public.repartos_jornada_lineas l on l.jornada_id = j.id
      left join public.empleados e on e.id = j.empleado_id
     where j.deuda_cobros_at is not null
       and l.forma_pago = 'deuda' and not l.cobro_anterior and l.importe <> 0
  ), ev as (
    select lin.*,
           enl.cliente_id,
           exists (
             select 1 from public.manager_facturas f
              where f.tipo = 'VENTA' and f.contact_id = lin.contact_id
                and f.fecha between lin.fecha - 1 and lin.fecha + 1
                and abs(f.total - lin.importe) < 0.02
           ) as hay_factura,
           exists (
             select 1 from public.manager_facturas f
              join public.cobros_movimientos m on m.numero_factura = f.doc_number
              where f.tipo = 'VENTA' and f.contact_id = lin.contact_id
                and f.fecha between lin.fecha - 1 and lin.fecha + 1
                and abs(f.total - lin.importe) < 0.02
           ) as en_cobros
      from lin
      left join public.cobros_cliente_enlace enl on enl.contact_id = lin.contact_id
     where not exists (
       select 1 from public.cobros_cierre_cuadres c
        where c.jornada_id = lin.jornada_id and c.contact_key = lin.k and c.importe = lin.importe
     )
  )
  select ev.jornada_id, ev.fecha, ev.repartidor, ev.contact_id, ev.contact_nombre, ev.k, ev.importe,
         case
           when ev.contact_id is null then 'sin_cliente'
           when ev.hay_factura and ev.cliente_id is null then 'cliente_sin_enlace'
           when ev.hay_factura then 'pendiente'
           when exists (select 1 from public.manager_facturas f
                         where f.tipo = 'VENTA' and f.contact_id = ev.contact_id
                           and f.fecha between ev.fecha - 1 and ev.fecha + 1) then 'importe_distinto'
           else 'sin_factura'
         end as motivo,
         ev.cliente_id,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'doc_number', f.doc_number, 'fecha', f.fecha, 'total', f.total,
                    'en_cobros', exists (select 1 from public.cobros_movimientos m where m.numero_factura = f.doc_number))
                  order by f.fecha, f.doc_number)
             from public.manager_facturas f
            where f.tipo = 'VENTA' and f.contact_id = ev.contact_id
              and f.fecha between ev.fecha - 3 and ev.fecha + 3
         ), '[]'::jsonb) as candidatas
    from ev
   where not ev.en_cobros
   order by ev.fecha desc, ev.contact_nombre;
$function$;
