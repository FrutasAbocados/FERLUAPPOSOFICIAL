-- ============================================================================
-- pg_cron — eliminar jobs duplicados de notificaciones-ia
-- ============================================================================
-- 2026-04-30 detectamos 2 jobs idénticos llamando a la edge `notificaciones-ia`
-- a las 07:00 UTC (jobids 3 y 5, mismo HTTP POST, mismo body). Resultado: el
-- cron disparaba la edge dos veces al día → gasto duplicado de Anthropic API.
--
-- Esta migración es idempotente: deja vivo el job de menor jobid y elimina
-- cualquier otro que llame a la misma edge. Si no hay duplicados (caso actual
-- tras `cron.unschedule(5)` aplicado el 2026-04-30), no hace nada.
--
-- NOTA: Management API SQL endpoint no acepta bloques DO $$ ... $$, por eso
-- usamos un SELECT con subquery en vez de un PL/pgSQL anónimo.
-- ============================================================================

select cron.unschedule(j.jobid)
from cron.job j
where j.command like '%notificaciones-ia%'
  and j.jobid > (
    select min(jobid)
    from cron.job
    where command like '%notificaciones-ia%'
  );
