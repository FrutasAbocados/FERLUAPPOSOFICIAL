-- holded-sync: ventana de recogida y timeout del cron.
--
-- Problema 1: el cron horario mandaba start = now() - 7 days, así que una
-- factura editada en Holded con fecha de hace más de 7 días no se recogía
-- nunca (solo el botón Sincronizar, que va sin rango → 60 días).
--
-- Problema 2: net.http_post sin timeout_milliseconds usa el default de 5 s y
-- el sync tarda 7-40 s, así que net._http_response solo registraba timeouts y
-- no se veía si la ejecución había ido bien.
--
-- El horario sube a 14 días (barato: ~2k líneas) y se añade un pase profundo
-- diario de 60 días a las 04:20 UTC, hora sin otros crons. Hacer 60 días cada
-- hora serían ~21.5k líneas borradas+reinsertadas por hora sobre manager_lineas
-- (83 MB), que es justo la carga que está provocando los 504 de PostgREST.

select cron.alter_job(
  (select jobid from cron.job where jobname = 'holded-sync-hourly'),
  command => $job$
    select net.http_post(
      url     := 'https://ucjkyjhvvdofyaizzdbk.supabase.co/functions/v1/holded-sync',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body    := jsonb_build_object(
        'trigger', 'cron',
        'start',   to_char(now() - interval '14 days', 'YYYY-MM-DD'),
        'end',     to_char(now(),                      'YYYY-MM-DD')
      ),
      timeout_milliseconds := 120000
    );
  $job$
);

select cron.schedule(
  'holded-sync-deep-daily',
  '20 4 * * *',
  $job$
    select net.http_post(
      url     := 'https://ucjkyjhvvdofyaizzdbk.supabase.co/functions/v1/holded-sync',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body    := jsonb_build_object(
        'trigger', 'cron',
        'start',   to_char(now() - interval '60 days', 'YYYY-MM-DD'),
        'end',     to_char(now(),                      'YYYY-MM-DD')
      ),
      timeout_milliseconds := 300000
    );
  $job$
);
