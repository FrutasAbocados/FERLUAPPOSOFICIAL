-- La estadistica se consume desde la app autenticada y desde agent-chat con
-- service_role. No necesita estar expuesta al rol anonimo ni a PUBLIC.
revoke execute on function public.cash_stats_semanas(date, date) from public, anon;
grant execute on function public.cash_stats_semanas(date, date) to authenticated, service_role;
