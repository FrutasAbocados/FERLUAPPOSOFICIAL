-- Con la gestión abierta a cualquier trabajador, quien no es administración solo puede
-- cambiar estado y nota de resolución; el autor puede además corregir su propia incidencia
-- (lo usa repartos_jornada_sync_incidencias). Autor, origen y alta no se tocan, y
-- resuelto_por/resuelto_at los fija el servidor.
create or replace function public.incidencias_guard_gestion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_es_autor boolean;
begin
  if public.is_admin() then
    return new;
  end if;

  if new.autor_empleado_id is distinct from old.autor_empleado_id
     or new.created_at is distinct from old.created_at
     or new.origen_jornada_id is distinct from old.origen_jornada_id
     or new.origen_contact_key is distinct from old.origen_contact_key then
    raise exception 'no se puede cambiar el autor ni el origen de una incidencia';
  end if;

  select exists (select 1 from public.empleados e
                  where e.id = old.autor_empleado_id and e.user_id = auth.uid())
    into v_es_autor;
  if not v_es_autor and (
       new.contact_name_canon is distinct from old.contact_name_canon
    or new.fecha is distinct from old.fecha
    or new.tipo is distinct from old.tipo
    or new.descripcion is distinct from old.descripcion) then
    raise exception 'solo puedes cambiar el estado y la nota de resolución';
  end if;

  if new.estado is distinct from old.estado or new.resuelto_por is distinct from old.resuelto_por
     or new.resuelto_at is distinct from old.resuelto_at then
    if new.estado = 'resuelta' then
      new.resuelto_por := auth.uid();
      new.resuelto_at := coalesce(new.resuelto_at, now());
    else
      new.resuelto_por := null;
      new.resuelto_at := null;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists incidencias_guard_gestion on public.incidencias;
create trigger incidencias_guard_gestion before update on public.incidencias
  for each row execute function public.incidencias_guard_gestion();
