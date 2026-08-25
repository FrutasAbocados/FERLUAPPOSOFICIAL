-- Cierre explícito para instalaciones de Supabase con grants por defecto a anon.
-- Las RPC de gestoría solo deben existir para sesiones autenticadas.

revoke execute on function public.es_gestor_gedofu() from anon;
revoke execute on function public.gestoria_documentos(date, date, text) from anon;
revoke execute on function public.gestoria_lineas(date, date, text) from anon;
