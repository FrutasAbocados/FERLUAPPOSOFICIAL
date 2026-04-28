-- ============================================================================
-- Cron horario para holded-sync
-- ============================================================================
-- Cada hora invoca la Edge Function `holded-sync` con trigger=cron y rango
-- últimos 7 días (cubre re-cobros y modificaciones tardías de facturas).
--
-- Requiere extensiones pg_cron + pg_net habilitadas. La SERVICE_ROLE_KEY se
-- guarda como GUC (`app.supabase_service_role_key`) por simplicidad — la BD
-- la inyecta a la llamada HTTP.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Quita job antiguo si existía (para re-aplicar la migración limpiamente)
do $$
begin
  perform cron.unschedule('holded-sync-hourly')
  where exists (select 1 from cron.job where jobname = 'holded-sync-hourly');
exception when undefined_function then null;
end$$;

-- service_role_key se lee de vault.decrypted_secrets (creado fuera de migración).
select cron.schedule(
  'holded-sync-hourly',
  '5 * * * *',  -- minuto 5 de cada hora
  $cmd$
    select net.http_post(
      url     := 'https://ucjkyjhvvdofyaizzdbk.supabase.co/functions/v1/holded-sync',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body    := jsonb_build_object(
        'trigger', 'cron',
        'start',   to_char(now() - interval '7 days', 'YYYY-MM-DD'),
        'end',     to_char(now(),                     'YYYY-MM-DD')
      )
    );
  $cmd$
);
