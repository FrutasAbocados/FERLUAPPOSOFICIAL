-- Orden manual de paradas en la hoja de ruta.
-- Cuando override_orden es NULL, el orden lo calcula el frontend por (salida, horario).
-- Cuando es un entero, se respeta como orden absoluto dentro del repartidor del día.
-- El sort en frontend es: (override_orden NULLS LAST asc, salida asc, horario asc).

alter table public.pedidos_wa
  add column if not exists override_orden int4 null;

comment on column public.pedidos_wa.override_orden is
  'Orden manual asignado vía drag&drop en Hoja de Ruta. NULL = ordenar por salida+horario.';

-- RPC para reordenar masivamente las paradas de un repartidor en una fecha.
-- Recibe array ordenado de pedido ids y asigna override_orden = índice (base 1).
-- También limpia override_orden de pedidos del mismo (fecha, repartidor) que no estén en el array.
create or replace function public.pedidos_wa_reordenar_ruta(
  p_fecha date,
  p_repartidor text,
  p_orden uuid[]
)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_role public.app_role;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin_full', 'admin_op', 'responsable') then
    raise exception 'sin permiso para reordenar la hoja de ruta' using errcode = '42501';
  end if;

  if p_orden is null or array_length(p_orden, 1) is null then
    -- Sin ids: limpiar todos los override_orden de ese (fecha, repartidor)
    update public.pedidos_wa p
       set override_orden = null
     where p.fecha = p_fecha
       and coalesce(p.override_repartidor, (select c.repartidor from public.pedidos_wa_clientes c where c.id = p.cliente_id)) = p_repartidor;
    return;
  end if;

  -- Asignar 1..N a los ids del array
  update public.pedidos_wa p
     set override_orden = sub.idx
    from (
      select unnest(p_orden) as id, generate_subscripts(p_orden, 1) as idx
    ) sub
   where p.id = sub.id
     and p.fecha = p_fecha;
end;
$function$;

grant execute on function public.pedidos_wa_reordenar_ruta(date, text, uuid[]) to authenticated;
