-- Repartos jornada: aprobar cierre solo marca revisado.
-- Los gastos del repartidor quedan fuera del flujo por ahora.

create or replace function public.repartos_jornada_revisar(p_jornada_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then
    raise exception 'solo administración puede aprobar cierres';
  end if;

  if not exists (select 1 from public.repartos_jornada where id = p_jornada_id) then
    raise exception 'jornada no encontrada';
  end if;

  update public.repartos_jornada
     set revisado = true,
         revisado_at = now(),
         revisado_por = auth.uid(),
         updated_at = now()
   where id = p_jornada_id;
end;
$function$;
