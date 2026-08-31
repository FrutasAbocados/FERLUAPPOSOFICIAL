-- Las default privileges del proyecto conceden EXECUTE a anon al crear RPCs.
-- Estas funciones requieren sesión autenticada y no deben exponerse sin login.

revoke execute on function public.trabajadores_credito_solicitar(date, text, jsonb) from anon;
revoke execute on function public.trabajadores_credito_cancelar_propia(uuid) from anon;
revoke execute on function public.trabajadores_credito_resolver(uuid, boolean, jsonb, text) from anon;
revoke execute on function public.trabajadores_credito_solicitudes_pendientes() from anon;
