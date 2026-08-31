-- La vista debe respetar la RLS de public.empleados.
-- Matriz verificada antes de versionar este cambio:
-- admin_full -> equipo completo; empleado/gestor_cobros -> solo fila propia.

create or replace view public.empleados_equipo
with (security_invoker = on)
as
select
  e.id,
  e.user_id,
  e.nombre,
  e.alias,
  e.color,
  e.activo,
  e.puesto,
  e.pack,
  e.orden,
  e.mostrar_cierre_dia
from public.empleados e;

revoke all on public.empleados_equipo from anon, authenticated;
grant select on public.empleados_equipo to authenticated;

comment on view public.empleados_equipo is
  'Directorio de empleados sujeto a la RLS de public.empleados; los trabajadores solo resuelven su propia ficha.';
