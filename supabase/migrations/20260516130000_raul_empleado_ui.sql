-- Raul debe operar como trabajador: HomeEmpleado + módulos de empleado.
-- Mantiene el vínculo existente con empleados.user_id y exige empleado activo.

update public.profiles p
set role = 'empleado'::public.app_role
where p.email = 'raulpedper@gmail.com'
  and exists (
    select 1
    from public.empleados e
    where e.user_id = p.id
      and e.activo = true
  );
