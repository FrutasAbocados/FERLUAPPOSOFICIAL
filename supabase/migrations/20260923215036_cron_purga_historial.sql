-- cron.job_run_details acumulaba ~130k filas (40 MB) desde abril: el job de 2 min
-- y el de 5 min generan ~1.000 filas al dia. Se conservan 14 dias.
select cron.schedule(
  'cron-historial-purga-diaria',
  '40 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '14 days'$$
);
