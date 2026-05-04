-- ============================================================================
-- Auditoría meta 2026-05-05 · Trigger notif puntos lee las 3 notas categoría
-- ============================================================================
-- El trigger antiguo leía `new.nota` (columna global vieja). Tras el rework
-- de puntos (commit `844a596`), las notas viven en
-- nota_puntualidad/nota_reparto/nota_responsabilidad. El trigger ahora
-- concatena las que tengan contenido.
-- ============================================================================

create or replace function public.notif_puntos_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_titulo text;
  v_cuerpo text;
  v_notas  text;
begin
  -- limpia notif previa del día por si se baja a 0 desde un valor positivo
  delete from public.notificaciones
   where audience = 'empleado'
     and empleado_id = new.empleado_id
     and tipo = 'puntos_dia'
     and (payload->>'fecha')::date = new.fecha;

  -- si el día queda a 0 puntos, no spamear con "0 puntos hoy"
  if new.total = 0 then
    return new;
  end if;

  -- Concatena las 3 notas no vacías separadas por " | "
  v_notas := nullif(
    array_to_string(
      array_remove(array[
        nullif(trim(new.nota_puntualidad),     ''),
        nullif(trim(new.nota_reparto),         ''),
        nullif(trim(new.nota_responsabilidad), '')
      ], null),
      ' | '
    ),
    ''
  );

  -- Fallback a la columna global vieja si las 3 nuevas están vacías
  if v_notas is null then
    v_notas := nullif(trim(new.nota), '');
  end if;

  v_titulo := '⭐ ' || new.total || ' puntos hoy';
  v_cuerpo := 'Puntualidad ' || new.puntualidad ||
              ' · Reparto ' || new.reparto ||
              ' · Responsabilidad ' || new.responsabilidad ||
              coalesce(' · ' || v_notas, '');

  perform public.notif_emit(
    'empleado', new.empleado_id, 'puntos_dia',
    v_titulo, v_cuerpo,
    jsonb_build_object('fecha', new.fecha, 'total', new.total)
  );
  return new;
end;
$function$;
