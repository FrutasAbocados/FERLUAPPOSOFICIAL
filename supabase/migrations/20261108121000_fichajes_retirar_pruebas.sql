-- Periodo de pruebas del sistema de fichaje (jun–oct 2026), confirmado por Luis el 2026-11-08.
-- Se retiran del registro, sin inventar horas, los fichajes imposibles de esa fase:
--   · olvidos de salida cerrados al día siguiente (>18 h);
--   · fichajes de menos de 15 min (dobles pulsaciones / pruebas).
-- Quedan íntegros en trabajadores_fichajes_incidencias (tipo prueba_sistema, descartada)
-- y en el historial append-only; copia previa en trabajadores_fichajes_backup_20261108.
select public.trabajadores_fichaje_apartar_interno(
         f.id, 'prueba_sistema', 'descartada',
         case when f.ts_out - f.ts_in > interval '18 hours'
              then 'Periodo de pruebas del sistema de fichaje (jun–oct 2026): salida no registrada; la hora real no consta y no se ha estimado'
              else 'Periodo de pruebas del sistema de fichaje (jun–oct 2026): fichaje de 0 minutos (prueba o doble pulsación)'
         end)
  from public.trabajadores_fichajes f
 where f.ts_in < '2026-11-01'
   and (f.ts_out - f.ts_in > interval '18 hours' or f.ts_out - f.ts_in < interval '15 minutes');
