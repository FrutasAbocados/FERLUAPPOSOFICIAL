-- Detecta fichajes abiertos de días anteriores (olvido de salida) y envía push:
--   · al empleado (recordatorio)
--   · a admin (resumen para que Álvaro lo corrija)
-- Insertar en notificaciones dispara el push por trigger. Guard anti-duplicado 12h.
create or replace function public.trabajadores_fichajes_notificar_olvidos()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_rec   record;
  v_lista text := '';
  v_n     int  := 0;
begin
  for v_rec in
    select f.id, f.empleado_id, e.nombre,
           (f.ts_in at time zone 'Europe/Madrid') as ts_in_local
    from public.trabajadores_fichajes f
    join public.empleados e on e.id = f.empleado_id
    where f.ts_out is null
      and (f.ts_in at time zone 'Europe/Madrid')::date
          < (now() at time zone 'Europe/Madrid')::date
    order by e.nombre
  loop
    v_n := v_n + 1;
    v_lista := v_lista || '• ' || v_rec.nombre || ' (desde '
            || to_char(v_rec.ts_in_local, 'DD/MM HH24:MI') || ')' || chr(10);

    -- recordatorio al empleado (no duplicar en 12h)
    if not exists (
      select 1 from public.notificaciones n
      where n.tipo = 'fichaje_olvido' and n.audience = 'empleado'
        and n.empleado_id = v_rec.empleado_id
        and n.created_at > now() - interval '12 hours'
    ) then
      insert into public.notificaciones (audience, empleado_id, tipo, titulo, cuerpo, payload)
      values (
        'empleado', v_rec.empleado_id, 'fichaje_olvido',
        '⏰ Olvidaste fichar salida',
        'Tu fichaje del ' || to_char(v_rec.ts_in_local, 'DD/MM') || ' a las '
          || to_char(v_rec.ts_in_local, 'HH24:MI')
          || ' sigue abierto. Avisa a Álvaro para corregirlo.',
        jsonb_build_object('url', '/trabajadores', 'fichaje_id', v_rec.id)
      );
    end if;
  end loop;

  if v_n > 0 then
    -- resumen para admin (no duplicar en 12h)
    if not exists (
      select 1 from public.notificaciones n
      where n.tipo = 'fichaje_olvido' and n.audience = 'admin'
        and n.created_at > now() - interval '12 hours'
    ) then
      insert into public.notificaciones (audience, tipo, titulo, cuerpo, payload)
      values (
        'admin', 'fichaje_olvido',
        '⏰ ' || v_n || case when v_n = 1 then ' fichaje sin cerrar' else ' fichajes sin cerrar' end,
        'Fichajes abiertos de días anteriores (probable olvido de salida):' || chr(10) || v_lista,
        jsonb_build_object('url', '/trabajadores?tab=fichajes')
      );
    end if;
  end if;

  return v_n;
end;
$fn$;

revoke execute on function public.trabajadores_fichajes_notificar_olvidos() from anon, authenticated;

-- Cron diario 06:00 UTC (08:00 Madrid verano / 07:00 invierno)
select cron.schedule(
  'fichajes-olvidos-push',
  '0 6 * * *',
  'select public.trabajadores_fichajes_notificar_olvidos();'
);
