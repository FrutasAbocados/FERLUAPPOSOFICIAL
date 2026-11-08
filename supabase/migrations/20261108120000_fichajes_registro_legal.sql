-- Registro de jornada fiable (art. 34.9 ET):
--   1. Historial append-only de todo cambio en fichajes (valor anterior, autor, motivo).
--   2. Sin escritura directa a la tabla: solo RPCs, y las de administración exigen motivo.
--   3. Olvidos de salida: el fichaje abierto >16 h se aparta a incidencias (nunca se
--      cierra con la hora del día siguiente). El trabajador avisa a Álvaro; administración
--      confirma la hora real con motivo y el fichaje vuelve al registro.
--   4. Las horas se reciben en hora local de Madrid y se convierten en servidor.

-- ---------------------------------------------------------------------------
-- 1. Historial
-- ---------------------------------------------------------------------------
create table if not exists public.trabajadores_fichajes_eventos (
  id           bigint generated always as identity primary key,
  tabla        text not null,
  registro_id  uuid not null,
  empleado_id  uuid,
  accion       text not null check (accion in ('alta', 'cambio', 'baja')),
  antes        jsonb,
  despues      jsonb,
  motivo       text,
  actor        uuid,
  at           timestamptz not null default now()
);
create index if not exists trabajadores_fichajes_eventos_registro_idx
  on public.trabajadores_fichajes_eventos (registro_id, at);
create index if not exists trabajadores_fichajes_eventos_empleado_idx
  on public.trabajadores_fichajes_eventos (empleado_id, at);

alter table public.trabajadores_fichajes_eventos enable row level security;
revoke all on public.trabajadores_fichajes_eventos from anon, authenticated;
grant select on public.trabajadores_fichajes_eventos to authenticated;

create policy "trabajadores_fichajes_eventos: admin read"
  on public.trabajadores_fichajes_eventos for select to authenticated
  using ((select public.is_admin()));
create policy "trabajadores_fichajes_eventos: empleado lee propio"
  on public.trabajadores_fichajes_eventos for select to authenticated
  using (exists (select 1 from public.empleados e
                 where e.id = trabajadores_fichajes_eventos.empleado_id
                   and e.user_id = (select auth.uid())));

create or replace function public.trabajadores_fichajes_eventos_inmutable()
returns trigger language plpgsql set search_path to 'public' as $fn$
begin
  raise exception 'El historial de fichajes no se puede modificar ni borrar' using errcode = '42501';
end;
$fn$;

drop trigger if exists trabajadores_fichajes_eventos_inmutable_t on public.trabajadores_fichajes_eventos;
create trigger trabajadores_fichajes_eventos_inmutable_t
  before update or delete on public.trabajadores_fichajes_eventos
  for each row execute function public.trabajadores_fichajes_eventos_inmutable();
drop trigger if exists trabajadores_fichajes_eventos_no_truncate_t on public.trabajadores_fichajes_eventos;
create trigger trabajadores_fichajes_eventos_no_truncate_t
  before truncate on public.trabajadores_fichajes_eventos
  for each statement execute function public.trabajadores_fichajes_eventos_inmutable();

create or replace function public.trabajadores_fichajes_auditar()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_motivo text := nullif(current_setting('app.fichaje_motivo', true), '');
  v_row    jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.trabajadores_fichajes_eventos
    (tabla, registro_id, empleado_id, accion, antes, despues, motivo, actor)
  values (
    tg_table_name,
    (v_row->>'id')::uuid,
    (v_row->>'empleado_id')::uuid,
    case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    v_motivo,
    auth.uid()
  );
  return coalesce(new, old);
end;
$fn$;
revoke execute on function public.trabajadores_fichajes_auditar() from public, anon, authenticated;

drop trigger if exists trabajadores_fichajes_auditar_t on public.trabajadores_fichajes;
create trigger trabajadores_fichajes_auditar_t
  after insert or update or delete on public.trabajadores_fichajes
  for each row execute function public.trabajadores_fichajes_auditar();

-- Sin escritura directa: todo pasa por RPCs security definer.
drop policy if exists trabajadores_fichajes_cons_ins on public.trabajadores_fichajes;
drop policy if exists trabajadores_fichajes_cons_upd on public.trabajadores_fichajes;
drop policy if exists trabajadores_fichajes_cons_del on public.trabajadores_fichajes;
revoke insert, update, delete, truncate on public.trabajadores_fichajes from anon, authenticated;
revoke all on public.trabajadores_fichajes from anon;

-- ---------------------------------------------------------------------------
-- 2. Incidencias (fichajes apartados del registro hasta conocer la hora real)
-- ---------------------------------------------------------------------------
create table if not exists public.trabajadores_fichajes_incidencias (
  id                    uuid primary key default gen_random_uuid(),
  fichaje_id            uuid not null unique,
  empleado_id           uuid not null references public.empleados(id),
  tipo                  text not null check (tipo in ('olvido_salida', 'prueba_sistema')),
  estado                text not null default 'pendiente'
                        check (estado in ('pendiente', 'avisado', 'corregida', 'descartada')),
  ts_in                 timestamptz not null,
  ts_out_registrado     timestamptz,
  lat_in                double precision,
  lng_in                double precision,
  lat_out               double precision,
  lng_out               double precision,
  fuente                text,
  nota                  text,
  creado_original_por   uuid,
  creado_original_at    timestamptz,
  salida_propuesta      timestamptz,
  comentario_trabajador text,
  avisado_at            timestamptz,
  resuelta_at           timestamptz,
  resuelta_por          uuid,
  resolucion_motivo     text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists trabajadores_fichajes_incidencias_estado_idx
  on public.trabajadores_fichajes_incidencias (estado, ts_in);
create index if not exists trabajadores_fichajes_incidencias_empleado_idx
  on public.trabajadores_fichajes_incidencias (empleado_id, ts_in);

alter table public.trabajadores_fichajes_incidencias enable row level security;
revoke all on public.trabajadores_fichajes_incidencias from anon, authenticated;
grant select on public.trabajadores_fichajes_incidencias to authenticated;

create policy "trabajadores_fichajes_incidencias: admin read"
  on public.trabajadores_fichajes_incidencias for select to authenticated
  using ((select public.is_admin()));
create policy "trabajadores_fichajes_incidencias: empleado lee propio"
  on public.trabajadores_fichajes_incidencias for select to authenticated
  using (exists (select 1 from public.empleados e
                 where e.id = trabajadores_fichajes_incidencias.empleado_id
                   and e.user_id = (select auth.uid())));
create policy "trabajadores_fichajes_incidencias: responsable read"
  on public.trabajadores_fichajes_incidencias for select to authenticated
  using ((select public.es_responsable()));

create or replace function public.trabajadores_fichajes_incidencias_touch()
returns trigger language plpgsql set search_path to 'public' as $fn$
begin new.updated_at := now(); return new; end;
$fn$;
drop trigger if exists trabajadores_fichajes_incidencias_touch_t on public.trabajadores_fichajes_incidencias;
create trigger trabajadores_fichajes_incidencias_touch_t
  before update on public.trabajadores_fichajes_incidencias
  for each row execute function public.trabajadores_fichajes_incidencias_touch();

drop trigger if exists trabajadores_fichajes_incidencias_auditar_t on public.trabajadores_fichajes_incidencias;
create trigger trabajadores_fichajes_incidencias_auditar_t
  after insert or update or delete on public.trabajadores_fichajes_incidencias
  for each row execute function public.trabajadores_fichajes_auditar();

-- Aparta del registro un fichaje (lo copia íntegro a incidencias y lo quita de la tabla).
create or replace function public.trabajadores_fichaje_apartar_interno(
  p_fichaje_id uuid, p_tipo text, p_estado text, p_motivo text
) returns uuid
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_f  public.trabajadores_fichajes%rowtype;
  v_id uuid;
begin
  select * into v_f from public.trabajadores_fichajes where id = p_fichaje_id for update;
  if not found then return null; end if;

  perform set_config('app.fichaje_motivo', p_motivo, true);

  insert into public.trabajadores_fichajes_incidencias
    (fichaje_id, empleado_id, tipo, estado, ts_in, ts_out_registrado,
     lat_in, lng_in, lat_out, lng_out, fuente, nota,
     creado_original_por, creado_original_at,
     resuelta_at, resolucion_motivo)
  values
    (v_f.id, v_f.empleado_id, p_tipo, p_estado, v_f.ts_in, v_f.ts_out,
     v_f.lat_in, v_f.lng_in, v_f.lat_out, v_f.lng_out, v_f.fuente, v_f.nota,
     v_f.created_by, v_f.created_at,
     case when p_estado in ('corregida', 'descartada') then now() end,
     case when p_estado in ('corregida', 'descartada') then p_motivo end)
  returning id into v_id;

  delete from public.trabajadores_fichajes where id = v_f.id;
  return v_id;
end;
$fn$;
revoke execute on function public.trabajadores_fichaje_apartar_interno(uuid, text, text, text)
  from public, anon, authenticated;

-- Aparta los fichajes abiertos de más de 16 h (todos, o solo los de un empleado).
create or replace function public.trabajadores_fichajes_apartar_olvidos(p_empleado_id uuid default null)
returns integer
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_rec record;
  v_n   int := 0;
begin
  for v_rec in
    select f.id, f.empleado_id, (f.ts_in at time zone 'Europe/Madrid') as ts_local
      from public.trabajadores_fichajes f
     where f.ts_out is null
       and f.ts_in < now() - interval '16 hours'
       and (p_empleado_id is null or f.empleado_id = p_empleado_id)
  loop
    perform public.trabajadores_fichaje_apartar_interno(
      v_rec.id, 'olvido_salida', 'pendiente',
      'Olvido de salida: fichaje abierto más de 16 h, apartado automáticamente hasta confirmar la hora real');
    v_n := v_n + 1;

    insert into public.notificaciones (audience, empleado_id, tipo, titulo, cuerpo, payload)
    values ('empleado', v_rec.empleado_id, 'fichaje_olvido',
            '⏰ No fichaste la salida',
            'Tu fichaje del ' || to_char(v_rec.ts_local, 'DD/MM') || ' (entrada '
              || to_char(v_rec.ts_local, 'HH24:MI') || ') no tiene salida. '
              || 'Entra en la app y pulsa «Avisar a Álvaro».',
            jsonb_build_object('url', '/trabajadores'));
  end loop;
  return v_n;
end;
$fn$;
revoke execute on function public.trabajadores_fichajes_apartar_olvidos(uuid) from public, anon, authenticated;

-- El aviso diario antiguo queda sustituido por el apartado horario.
create or replace function public.trabajadores_fichajes_notificar_olvidos()
returns integer
language sql security definer set search_path to 'public' as $fn$
  select public.trabajadores_fichajes_apartar_olvidos(null);
$fn$;
revoke execute on function public.trabajadores_fichajes_notificar_olvidos() from public, anon, authenticated;

select cron.unschedule('fichajes-olvidos-push')
 where exists (select 1 from cron.job where jobname = 'fichajes-olvidos-push');
select cron.schedule('fichajes-apartar-olvidos', '7 * * * *',
                     'select public.trabajadores_fichajes_apartar_olvidos(null);');

-- ---------------------------------------------------------------------------
-- 3. Fichar (trabajador). Un olvido nunca se cierra con la hora del día siguiente.
-- ---------------------------------------------------------------------------
create or replace function public.trabajadores_fichaje_abrir(
  p_lat double precision default null, p_lng double precision default null, p_nota text default null)
returns uuid
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_emp uuid;
  v_id  uuid;
begin
  select e.id into v_emp from public.empleados e
   where e.user_id = auth.uid() and e.activo = true limit 1;
  if v_emp is null then
    raise exception 'Tu usuario no está vinculado a un empleado activo' using errcode = '42501';
  end if;

  perform public.trabajadores_fichajes_apartar_olvidos(v_emp);

  select id into v_id from public.trabajadores_fichajes
   where empleado_id = v_emp and ts_out is null limit 1;
  if v_id is not null then return v_id; end if;

  perform set_config('app.fichaje_motivo', 'Entrada fichada por el trabajador', true);
  insert into public.trabajadores_fichajes
    (empleado_id, ts_in, lat_in, lng_in, fuente, nota, created_by)
  values
    (v_emp, now(), p_lat, p_lng, 'app', nullif(trim(p_nota), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$fn$;

create or replace function public.trabajadores_fichaje_cerrar(
  p_lat double precision default null, p_lng double precision default null, p_nota text default null)
returns uuid
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_emp uuid;
  v_id  uuid;
  v_n   int;
begin
  select e.id into v_emp from public.empleados e
   where e.user_id = auth.uid() and e.activo = true limit 1;
  if v_emp is null then
    raise exception 'Tu usuario no está vinculado a un empleado activo' using errcode = '42501';
  end if;

  v_n := public.trabajadores_fichajes_apartar_olvidos(v_emp);
  if v_n > 0 then
    raise exception 'Tu fichaje anterior no tenía salida y se ha apartado. Pulsa «Avisar a Álvaro» y vuelve a fichar la entrada.'
      using errcode = 'P0001';
  end if;

  perform set_config('app.fichaje_motivo', 'Salida fichada por el trabajador', true);
  update public.trabajadores_fichajes
     set ts_out = now(),
         lat_out = p_lat,
         lng_out = p_lng,
         nota = nullif(coalesce(nota, '') ||
                case when nullif(trim(p_nota), '') is not null
                  then ' · salida: ' || trim(p_nota) else '' end, '')
   where empleado_id = v_emp and ts_out is null
   returning id into v_id;

  if v_id is null then
    raise exception 'No tienes fichaje abierto' using errcode = '42501';
  end if;
  return v_id;
end;
$fn$;

-- Incidencias propias pendientes (para el aviso en la pantalla del trabajador).
create or replace function public.trabajadores_fichajes_mis_incidencias()
returns table (id uuid, ts_in timestamptz, estado text, salida_propuesta timestamptz, avisado_at timestamptz)
language sql stable security definer set search_path to 'public' as $fn$
  select i.id, i.ts_in, i.estado, i.salida_propuesta, i.avisado_at
    from public.trabajadores_fichajes_incidencias i
    join public.empleados e on e.id = i.empleado_id
   where e.user_id = auth.uid()
     and i.estado in ('pendiente', 'avisado')
   order by i.ts_in desc;
$fn$;
grant execute on function public.trabajadores_fichajes_mis_incidencias() to authenticated;

-- El trabajador avisa a Álvaro: queda constancia, push a administración y texto de WhatsApp.
create or replace function public.trabajadores_fichaje_avisar_alvaro(
  p_incidencia_id uuid, p_salida_local timestamp, p_comentario text default null)
returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_i       public.trabajadores_fichajes_incidencias%rowtype;
  v_nombre  text;
  v_salida  timestamptz;
  v_tel     text;
  v_texto   text;
begin
  select i.* into v_i
    from public.trabajadores_fichajes_incidencias i
    join public.empleados e on e.id = i.empleado_id
   where i.id = p_incidencia_id and e.user_id = auth.uid()
   for update of i;
  if not found then
    raise exception 'Incidencia no encontrada' using errcode = '42501';
  end if;
  if v_i.estado not in ('pendiente', 'avisado') then
    raise exception 'Esta incidencia ya está resuelta';
  end if;

  v_salida := p_salida_local at time zone 'Europe/Madrid';
  if v_salida <= v_i.ts_in or v_salida > v_i.ts_in + interval '16 hours' or v_salida > now() then
    raise exception 'La hora de salida debe ser posterior a la entrada (%), en las 16 h siguientes y no futura',
      to_char(v_i.ts_in at time zone 'Europe/Madrid', 'DD/MM HH24:MI');
  end if;

  select nombre into v_nombre from public.empleados where id = v_i.empleado_id;

  perform set_config('app.fichaje_motivo', 'Aviso del trabajador a Álvaro con la hora de salida', true);
  update public.trabajadores_fichajes_incidencias
     set estado = 'avisado',
         salida_propuesta = v_salida,
         comentario_trabajador = nullif(trim(p_comentario), ''),
         avisado_at = now()
   where id = v_i.id;

  v_texto := 'Hola Álvaro, soy ' || v_nombre || '. El '
    || to_char(v_i.ts_in at time zone 'Europe/Madrid', 'DD/MM') || ' entré a las '
    || to_char(v_i.ts_in at time zone 'Europe/Madrid', 'HH24:MI') || ' y no fiché la salida. Salí a las '
    || to_char(p_salida_local, 'HH24:MI')
    || case when to_char(p_salida_local, 'YYYY-MM-DD') <> to_char(v_i.ts_in at time zone 'Europe/Madrid', 'YYYY-MM-DD')
            then ' del ' || to_char(p_salida_local, 'DD/MM') else '' end
    || '.' || coalesce(' ' || nullif(trim(p_comentario), ''), '')
    || ' ¿Me lo corriges? (Abocados OS → Trabajadores → Fichajes → Incidencias)';

  insert into public.notificaciones (audience, tipo, titulo, cuerpo, payload)
  values ('admin', 'fichaje_olvido',
          '⏰ ' || v_nombre || ': corregir fichaje del ' || to_char(v_i.ts_in at time zone 'Europe/Madrid', 'DD/MM'),
          v_texto,
          jsonb_build_object('url', '/trabajadores?tab=fichajes', 'incidencia_id', v_i.id));

  select nullif(regexp_replace(value, '\D', '', 'g'), '') into v_tel
    from public.app_settings where key = 'fichajes_whatsapp_alvaro';

  return jsonb_build_object('telefono', v_tel, 'texto', v_texto);
end;
$fn$;
grant execute on function public.trabajadores_fichaje_avisar_alvaro(uuid, timestamp, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Administración (siempre con motivo; horas en hora local de Madrid)
-- ---------------------------------------------------------------------------
create or replace function public.trabajadores_fichajes_incidencias_admin(p_solo_abiertas boolean default true)
returns table (
  id uuid, empleado_id uuid, empleado_nombre text, tipo text, estado text,
  ts_in timestamptz, ts_out_registrado timestamptz, salida_propuesta timestamptz,
  comentario_trabajador text, avisado_at timestamptz, resuelta_at timestamptz, resolucion_motivo text)
language sql stable security definer set search_path to 'public' as $fn$
  select i.id, i.empleado_id, e.nombre, i.tipo, i.estado, i.ts_in, i.ts_out_registrado,
         i.salida_propuesta, i.comentario_trabajador, i.avisado_at, i.resuelta_at, i.resolucion_motivo
    from public.trabajadores_fichajes_incidencias i
    join public.empleados e on e.id = i.empleado_id
   where public.is_admin()
     and (not p_solo_abiertas or i.estado in ('pendiente', 'avisado'))
   order by (i.estado in ('pendiente', 'avisado')) desc, i.ts_in desc;
$fn$;
grant execute on function public.trabajadores_fichajes_incidencias_admin(boolean) to authenticated;

create or replace function public.trabajadores_fichaje_validar_tramo(
  p_empleado_id uuid, p_ts_in timestamptz, p_ts_out timestamptz, p_excluir uuid)
returns void
language plpgsql stable security definer set search_path to 'public' as $fn$
begin
  if p_ts_out is not null and p_ts_out <= p_ts_in then
    raise exception 'La salida debe ser posterior a la entrada';
  end if;
  if p_ts_out is not null and p_ts_out - p_ts_in > interval '16 hours' then
    raise exception 'Un fichaje no puede durar más de 16 h';
  end if;
  if p_ts_in > now() or p_ts_out > now() then
    raise exception 'No se pueden registrar horas futuras';
  end if;
  if exists (
    select 1 from public.trabajadores_fichajes f
     where f.empleado_id = p_empleado_id
       and f.id is distinct from p_excluir
       and tstzrange(f.ts_in, coalesce(f.ts_out, 'infinity')) &&
           tstzrange(p_ts_in, coalesce(p_ts_out, 'infinity'))
  ) then
    raise exception 'Se solapa con otro fichaje del mismo trabajador';
  end if;
end;
$fn$;
revoke execute on function public.trabajadores_fichaje_validar_tramo(uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;

create or replace function public.trabajadores_fichaje_incidencia_resolver(
  p_incidencia_id uuid, p_salida_local timestamp, p_motivo text)
returns uuid
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_i      public.trabajadores_fichajes_incidencias%rowtype;
  v_salida timestamptz;
  v_motivo text := nullif(trim(p_motivo), '');
begin
  if not public.is_admin() then raise exception 'Solo administración' using errcode = '42501'; end if;
  if v_motivo is null then raise exception 'Indica el motivo de la corrección'; end if;

  select * into v_i from public.trabajadores_fichajes_incidencias where id = p_incidencia_id for update;
  if not found then raise exception 'Incidencia no encontrada'; end if;
  if v_i.estado not in ('pendiente', 'avisado') then raise exception 'La incidencia ya está resuelta'; end if;

  v_salida := p_salida_local at time zone 'Europe/Madrid';
  perform public.trabajadores_fichaje_validar_tramo(v_i.empleado_id, v_i.ts_in, v_salida, null);

  perform set_config('app.fichaje_motivo', 'Corrección de olvido de salida: ' || v_motivo, true);
  insert into public.trabajadores_fichajes
    (id, empleado_id, ts_in, ts_out, lat_in, lng_in, fuente, nota, created_by, created_at)
  values
    (v_i.fichaje_id, v_i.empleado_id, v_i.ts_in, v_salida, v_i.lat_in, v_i.lng_in,
     'correccion_admin',
     'Salida corregida por administración: ' || v_motivo,
     v_i.creado_original_por, coalesce(v_i.creado_original_at, now()));

  update public.trabajadores_fichajes_incidencias
     set estado = 'corregida', resuelta_at = now(), resuelta_por = auth.uid(),
         resolucion_motivo = v_motivo
   where id = v_i.id;
  return v_i.fichaje_id;
end;
$fn$;
grant execute on function public.trabajadores_fichaje_incidencia_resolver(uuid, timestamp, text) to authenticated;

create or replace function public.trabajadores_fichaje_incidencia_descartar(p_incidencia_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare v_motivo text := nullif(trim(p_motivo), '');
begin
  if not public.is_admin() then raise exception 'Solo administración' using errcode = '42501'; end if;
  if v_motivo is null then raise exception 'Indica el motivo'; end if;
  perform set_config('app.fichaje_motivo', 'Incidencia descartada: ' || v_motivo, true);
  update public.trabajadores_fichajes_incidencias
     set estado = 'descartada', resuelta_at = now(), resuelta_por = auth.uid(), resolucion_motivo = v_motivo
   where id = p_incidencia_id and estado in ('pendiente', 'avisado');
  if not found then raise exception 'Incidencia no encontrada o ya resuelta'; end if;
end;
$fn$;
grant execute on function public.trabajadores_fichaje_incidencia_descartar(uuid, text) to authenticated;

create or replace function public.trabajadores_fichaje_admin_crear_v2(
  p_empleado_id uuid, p_ts_in_local timestamp, p_ts_out_local timestamp, p_motivo text)
returns uuid
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_id     uuid;
  v_in     timestamptz := p_ts_in_local at time zone 'Europe/Madrid';
  v_out    timestamptz := p_ts_out_local at time zone 'Europe/Madrid';
  v_motivo text := nullif(trim(p_motivo), '');
begin
  if not public.is_admin() then raise exception 'Solo administración' using errcode = '42501'; end if;
  if v_motivo is null then raise exception 'Indica el motivo del fichaje manual'; end if;
  if v_out is null then raise exception 'Indica la hora de salida'; end if;
  perform public.trabajadores_fichaje_validar_tramo(p_empleado_id, v_in, v_out, null);

  perform set_config('app.fichaje_motivo', 'Fichaje manual: ' || v_motivo, true);
  insert into public.trabajadores_fichajes (empleado_id, ts_in, ts_out, fuente, nota, created_by)
  values (p_empleado_id, v_in, v_out, 'manual_admin', 'Manual: ' || v_motivo, auth.uid())
  returning id into v_id;
  return v_id;
end;
$fn$;
grant execute on function public.trabajadores_fichaje_admin_crear_v2(uuid, timestamp, timestamp, text) to authenticated;

create or replace function public.trabajadores_fichaje_admin_editar_v2(
  p_id uuid, p_ts_in_local timestamp, p_ts_out_local timestamp, p_motivo text)
returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_f      public.trabajadores_fichajes%rowtype;
  v_in     timestamptz := p_ts_in_local at time zone 'Europe/Madrid';
  v_out    timestamptz := p_ts_out_local at time zone 'Europe/Madrid';
  v_motivo text := nullif(trim(p_motivo), '');
begin
  if not public.is_admin() then raise exception 'Solo administración' using errcode = '42501'; end if;
  if v_motivo is null then raise exception 'Indica el motivo del cambio'; end if;
  select * into v_f from public.trabajadores_fichajes where id = p_id for update;
  if not found then raise exception 'Fichaje no encontrado'; end if;
  perform public.trabajadores_fichaje_validar_tramo(v_f.empleado_id, v_in, v_out, p_id);

  perform set_config('app.fichaje_motivo', 'Corrección: ' || v_motivo, true);
  update public.trabajadores_fichajes
     set ts_in = v_in, ts_out = v_out,
         nota = nullif(concat_ws(' · ', nullif(v_f.nota, ''), 'Corregido: ' || v_motivo), '')
   where id = p_id;
end;
$fn$;
grant execute on function public.trabajadores_fichaje_admin_editar_v2(uuid, timestamp, timestamp, text) to authenticated;

create or replace function public.trabajadores_fichaje_admin_anular(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare v_motivo text := nullif(trim(p_motivo), '');
begin
  if not public.is_admin() then raise exception 'Solo administración' using errcode = '42501'; end if;
  if v_motivo is null then raise exception 'Indica el motivo de la anulación'; end if;
  if public.trabajadores_fichaje_apartar_interno(p_id, 'olvido_salida', 'descartada', 'Anulado: ' || v_motivo) is null then
    raise exception 'Fichaje no encontrado';
  end if;
end;
$fn$;
grant execute on function public.trabajadores_fichaje_admin_anular(uuid, text) to authenticated;

-- Las RPC antiguas siguen sirviendo a la versión desplegada hasta publicar la nueva,
-- pero quedan registradas en el historial como cambio sin motivo.
create or replace function public.trabajadores_fichaje_admin_editar(
  p_id uuid, p_ts_in timestamptz, p_ts_out timestamptz, p_nota text default null)
returns void
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not public.is_admin() then raise exception 'Solo admin' using errcode = '42501'; end if;
  if p_ts_out is not null and p_ts_out <= p_ts_in then
    raise exception 'ts_out debe ser posterior a ts_in';
  end if;
  perform set_config('app.fichaje_motivo', 'Sin motivo (versión anterior de la app)', true);
  update public.trabajadores_fichajes
     set ts_in = p_ts_in, ts_out = p_ts_out, nota = nullif(trim(p_nota), '')
   where id = p_id;
end;
$fn$;

create or replace function public.trabajadores_fichaje_admin_borrar(p_id uuid)
returns void
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not public.is_admin() then raise exception 'Solo admin' using errcode = '42501'; end if;
  perform public.trabajadores_fichaje_apartar_interno(
    p_id, 'olvido_salida', 'descartada', 'Borrado sin motivo (versión anterior de la app)');
end;
$fn$;

create or replace function public.trabajadores_fichaje_admin_crear(
  p_empleado_id uuid, p_ts_in timestamptz, p_ts_out timestamptz, p_nota text default null)
returns uuid
language plpgsql security definer set search_path to 'public' as $fn$
declare v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo admin puede crear fichajes retrospectivos' using errcode = '42501';
  end if;
  if p_ts_out <= p_ts_in then raise exception 'ts_out debe ser posterior a ts_in'; end if;
  perform set_config('app.fichaje_motivo', coalesce('Manual: ' || nullif(trim(p_nota), ''),
                                                    'Sin motivo (versión anterior de la app)'), true);
  insert into public.trabajadores_fichajes (empleado_id, ts_in, ts_out, fuente, nota, created_by)
  values (p_empleado_id, p_ts_in, p_ts_out, 'manual_admin', nullif(trim(p_nota), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$fn$;

-- Historial de un fichaje (para la ficha de administración y para Inspección).
create or replace function public.trabajadores_fichaje_historial(p_registro_id uuid)
returns table (at timestamptz, accion text, motivo text, actor_email text, antes jsonb, despues jsonb)
language sql stable security definer set search_path to 'public' as $fn$
  select ev.at, ev.accion, ev.motivo, u.email::text, ev.antes, ev.despues
    from public.trabajadores_fichajes_eventos ev
    left join auth.users u on u.id = ev.actor
   where public.is_admin() and ev.registro_id = p_registro_id
   order by ev.at;
$fn$;
grant execute on function public.trabajadores_fichaje_historial(uuid) to authenticated;

-- Nada de fichajes sin sesión iniciada.
revoke execute on function
  public.trabajadores_fichaje_admin_anular(uuid, text),
  public.trabajadores_fichaje_admin_crear_v2(uuid, timestamp, timestamp, text),
  public.trabajadores_fichaje_admin_editar_v2(uuid, timestamp, timestamp, text),
  public.trabajadores_fichaje_avisar_alvaro(uuid, timestamp, text),
  public.trabajadores_fichaje_historial(uuid),
  public.trabajadores_fichaje_incidencia_descartar(uuid, text),
  public.trabajadores_fichaje_incidencia_resolver(uuid, timestamp, text),
  public.trabajadores_fichajes_incidencias_admin(boolean),
  public.trabajadores_fichajes_mis_incidencias(),
  public.trabajadores_fichajes_eventos_inmutable(),
  public.trabajadores_fichajes_incidencias_touch()
from public, anon;

-- Fuente propia para las salidas corregidas tras un olvido.
alter table public.trabajadores_fichajes drop constraint if exists trabajadores_fichajes_fuente_check;
alter table public.trabajadores_fichajes add constraint trabajadores_fichajes_fuente_check
  check (fuente = any (array['app', 'manual_admin', 'correccion_admin']));

-- Un fichaje abierto de más de 16 h ya no se muestra como «trabajando»:
-- al pulsar fichar se aparta y aparece el aviso para Álvaro.
create or replace function public.trabajadores_fichaje_actual()
returns table (id uuid, empleado_id uuid, empleado_nombre text, ts_in timestamptz, segundos_dentro integer)
language sql stable security definer set search_path to 'public' as $fn$
  select f.id, f.empleado_id, e.nombre, f.ts_in,
         extract(epoch from (now() - f.ts_in))::int as segundos_dentro
    from public.trabajadores_fichajes f
    join public.empleados e on e.id = f.empleado_id
   where e.user_id = auth.uid() and f.ts_out is null
     and f.ts_in > now() - interval '16 hours'
   limit 1;
$fn$;
