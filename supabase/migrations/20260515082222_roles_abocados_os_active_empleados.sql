-- Roles Abocados OS — cierre seguro para empleados activos
-- Los permisos operativos de "empleado" solo aplican si la cuenta está
-- vinculada a un empleado activo. Germán queda inactivo según estado operativo.

update public.empleados
set activo = false,
    updated_at = now()
where user_id = (
  select id
  from public.profiles
  where email = 'germankramer@hotmail.es'
)
and activo = true;

create or replace function public.puede_ver_clientes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role)
        or (
          p.role = 'empleado'::public.app_role
          and exists (
            select 1
            from public.empleados e
            where e.user_id = p.id
              and e.activo = true
          )
        )
      )
  );
$$;

create or replace function public.puede_operar_pedidos_wa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role)
        or (
          p.role = 'empleado'::public.app_role
          and exists (
            select 1
            from public.empleados e
            where e.user_id = p.id
              and e.activo = true
          )
        )
      )
  );
$$;

grant execute on function public.puede_ver_clientes() to authenticated;
grant execute on function public.puede_operar_pedidos_wa() to authenticated;
