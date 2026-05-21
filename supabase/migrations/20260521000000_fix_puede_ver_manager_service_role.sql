-- Fix: puede_ver_manager() devolvía NULL con service role (auth.uid()=null),
-- filtrando todas las filas en RPCs de productos y clientes del agente IA.
-- Ahora retorna TRUE cuando no hay sesión de usuario (service role / conexión directa).
CREATE OR REPLACE FUNCTION public.puede_ver_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    auth.uid() IS NULL          -- service_role o conexión directa (edge function agent)
    OR public.is_admin()
    OR public.es_gestor_cobros()
$$;
