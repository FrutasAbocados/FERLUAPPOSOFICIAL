-- Historial desde su activación: no reconstruye operaciones borradas anteriormente.
create table public.tesoreria_historial (
  id bigint generated always as identity primary key,
  movimiento_id uuid not null,
  accion text not null check (accion in ('inicio','alta','edicion','borrado')),
  antes jsonb,
  despues jsonb,
  actor_id uuid,
  actor_nombre text not null,
  registrado_at timestamptz not null default clock_timestamp()
);
create index tesoreria_historial_movimiento_idx on public.tesoreria_historial(movimiento_id,id desc);
alter table public.tesoreria_historial enable row level security;
create policy "tesoreria_historial: admin lee" on public.tesoreria_historial
  for select to authenticated using ((select public.is_admin()));
revoke all on public.tesoreria_historial from public, anon, authenticated;
grant select on public.tesoreria_historial to authenticated;

create function public.tesoreria_historial_inmutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'El historial de tesorería es permanente y no se puede modificar ni borrar.';
end;
$$;
create trigger tesoreria_historial_inmutable before update or delete or truncate
  on public.tesoreria_historial for each statement
  execute function public.tesoreria_historial_inmutable();
-- TRUNCATE no dispara los triggers por fila: bloquearlo también en movimientos.
create trigger tesoreria_no_truncate before truncate on public.tesoreria_movimientos
  for each statement execute function public.tesoreria_historial_inmutable();

create function public.tesoreria_registrar_historial() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_nombre text;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then return new; end if;
  select display_name into v_nombre from public.profiles where id=v_actor;
  insert into public.tesoreria_historial(movimiento_id,accion,antes,despues,actor_id,actor_nombre)
  values (
    case when tg_op='DELETE' then old.id else new.id end,
    case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'edicion' else 'borrado' end,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
    v_actor, coalesce(nullif(v_nombre,''), case when v_actor is null then 'Sistema' else 'Usuario sin perfil' end)
  );
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.tesoreria_registrar_historial() from public, anon, authenticated;

-- Bloqueo breve para que ninguna escritura quede entre la foto y el trigger.
lock table public.tesoreria_movimientos in share row exclusive mode;
insert into public.tesoreria_historial(movimiento_id,accion,despues,actor_nombre)
  select id,'inicio',to_jsonb(m),'Estado al activar el historial'
  from public.tesoreria_movimientos m;
create trigger tesoreria_registrar_historial after insert or update or delete
  on public.tesoreria_movimientos for each row
  execute function public.tesoreria_registrar_historial();

create function public.tesoreria_restaurar_movimiento(p_evento bigint,p_motivo text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_evento public.tesoreria_historial; v_mov public.tesoreria_movimientos;
begin
  if not coalesce(public.is_admin(),false) then
    raise exception 'Solo administración puede restaurar movimientos.' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_motivo,''))) < 5 then
    raise exception 'Indica el motivo de la restauración (mínimo 5 caracteres).';
  end if;
  -- Serializa comprobación + inserción; evita doble restauración concurrente.
  lock table public.tesoreria_movimientos in share row exclusive mode;
  select * into v_evento from public.tesoreria_historial where id=p_evento;
  if not found or v_evento.accion <> 'borrado' then
    raise exception 'Selecciona un borrado registrado en el historial.';
  end if;
  if exists(select 1 from public.tesoreria_movimientos where id=v_evento.movimiento_id)
    or exists(select 1 from public.tesoreria_historial where movimiento_id=v_evento.movimiento_id and id>p_evento) then
    raise exception 'Este movimiento ya se restauró o tiene cambios posteriores. Recarga el historial.';
  end if;
  v_mov := jsonb_populate_record(null::public.tesoreria_movimientos,v_evento.antes);
  v_mov.notas := concat_ws(E'\n',nullif(v_mov.notas,''),
    'Restaurado desde historial #'||p_evento||'. Motivo: '||btrim(p_motivo));
  v_mov.updated_at := clock_timestamp();
  insert into public.tesoreria_movimientos select (v_mov).*;
  return v_mov.id;
end;
$$;
revoke all on function public.tesoreria_restaurar_movimiento(bigint,text) from public,anon;
grant execute on function public.tesoreria_restaurar_movimiento(bigint,text) to authenticated;
