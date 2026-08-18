-- La edge pedido-a-holded valida al usuario y después resuelve las líneas por
-- PostgREST usando la service_role. La guarda anterior exigía auth.uid(), que
-- es NULL para service_role, y devolvía cero líneas: la edge respondía 422
-- "pedido sin líneas" antes de construir el body de Holded.

create or replace function public.puede_operar_pedidos_wa()
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in (
            'admin_full'::public.app_role,
            'admin_op'::public.app_role,
            'responsable'::public.app_role,
            'gestor_cobros'::public.app_role
          )
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
$function$;

revoke execute on function public.puede_operar_pedidos_wa()
  from public, anon;
grant execute on function public.puede_operar_pedidos_wa()
  to authenticated, service_role;

comment on function public.puede_operar_pedidos_wa() is
  'Autoriza roles operativos activos y service_role para llamadas internas validadas por edge functions.';
