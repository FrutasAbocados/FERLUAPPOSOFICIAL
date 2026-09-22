-- is_admin() / is_admin_full() nunca devuelven NULL.
--
-- Sin fila en profiles, `current_role() in (...)` da NULL, y en plpgsql
-- `if not is_admin() then raise ...` NO entra con NULL: la guarda se salta.
-- Lo destapo la prueba de T6 (el RPC de trazabilidad no rechazaba a una sesion
-- sin perfil), pero el patron esta en 29 funciones: cierre A6, VERI*FACTU,
-- fichajes, ruleta, costes...
--
-- Hoy no hay usuarios sin perfil (verificado), asi que no era explotable; bastaba
-- con que un alta fallara al crear su perfil. Se arregla en el helper y no en 29
-- sitios. Para cualquier usuario con perfil el resultado no cambia, y en RLS
-- NULL y false ya se comportaban igual. Ninguna funcion ni policy depende del
-- NULL (verificado). es_responsable() ya usaba exists() y no se toca.

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path to 'public'
as $fn$
  select coalesce(
    public.current_role() in ('admin_full'::public.app_role, 'admin_op'::public.app_role),
    false
  );
$fn$;

create or replace function public.is_admin_full()
returns boolean
language sql
stable
set search_path to 'public'
as $fn$
  select coalesce(public.current_role() = 'admin_full'::public.app_role, false);
$fn$;
