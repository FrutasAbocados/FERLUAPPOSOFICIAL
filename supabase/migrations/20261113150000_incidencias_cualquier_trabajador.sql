-- Cualquier trabajador activo con usuario puede gestionar (marcar en proceso / resolver)
-- incidencias, no solo los marcados con empleados.puede_gestionar_incidencias.
-- La columna se conserva (sin uso) por si se quiere volver a restringir.
create or replace function public.puede_gestionar_incidencias()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_admin() or exists (
    select 1 from public.empleados e
    where e.user_id = auth.uid() and e.activo
  );
$function$;
