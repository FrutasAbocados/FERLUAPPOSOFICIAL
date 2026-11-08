-- Luis (2026-11-08): las jornadas largas del periodo de pruebas son falsas; los trabajadores no
-- hacen más de 7 h y siempre descansan 12 h. Son salidas fichadas horas después de salir.
-- Se retiran del registro sin estimar la hora real (quedan íntegras en incidencias e historial):
--   · las 8 jornadas previas a un descanso <12 h;
--   · cualquier otra jornada >12 h anterior a noviembre.
with x as (
  select f.id, f.ts_in, f.ts_out,
         lead(f.ts_in) over (partition by f.empleado_id order by f.ts_in) as siguiente_in
    from public.trabajadores_fichajes f
)
select public.trabajadores_fichaje_apartar_interno(
         x.id, 'prueba_sistema', 'descartada',
         'Periodo de pruebas del sistema de fichaje: salida fichada horas después de salir (la empresa confirma jornadas ≤7 h y descanso ≥12 h); la hora real no consta y no se ha estimado')
  from x
 where x.ts_in < '2026-11-01'
   and x.ts_out is not null
   and (x.ts_out - x.ts_in > interval '12 hours'
        or (x.siguiente_in - x.ts_out < interval '12 hours' and x.siguiente_in - x.ts_out > interval '2 hours'));
