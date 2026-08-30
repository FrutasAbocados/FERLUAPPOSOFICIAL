-- RLS no protege TRUNCATE. Los trabajadores y administradores solo necesitan
-- lectura directa; todas las escrituras del coach pasan por el backend Edge.

revoke all on public.people_coach_consents from authenticated;
revoke all on public.people_coach_sessions from authenticated;
revoke all on public.people_coach_shares from authenticated;
revoke all on public.people_coach_profile_items from authenticated;
revoke all on public.people_coach_share_deliveries from authenticated;

grant select on public.people_coach_consents to authenticated;
grant select on public.people_coach_sessions to authenticated;
grant select on public.people_coach_shares to authenticated;
grant select on public.people_coach_profile_items to authenticated;
grant select on public.people_coach_share_deliveries to authenticated;
