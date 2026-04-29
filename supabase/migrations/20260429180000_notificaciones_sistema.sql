-- ============================================================================
-- Notificaciones — sistema base
-- ============================================================================
-- Inbox de avisos para Dashboard. Dos audiencias:
--   audience='admin'    → visible para admin_full / admin_op / responsable
--   audience='empleado' → visible solo para el empleado dueño (empleado_id)
--
-- Comportamiento:
--   - TTL 7 días (expires_at). Función purgar borra expiradas.
--   - "marcar leída" = DELETE inmediato (decisión usuario: no historial).
--   - Triggers automáticos en vacaciones, puntos y tareas.
--   - Función emit() reusable desde triggers y desde edge function IA.
-- ============================================================================

create table if not exists public.notificaciones (
  id           uuid primary key default gen_random_uuid(),
  audience     text not null check (audience in ('admin', 'empleado')),
  empleado_id  uuid references public.empleados(id) on delete cascade,
  tipo         text not null,
  titulo       text not null,
  cuerpo       text,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),

  constraint notif_empleado_si_audience
    check (audience = 'admin' or empleado_id is not null)
);

create index if not exists notif_audience_created_idx
  on public.notificaciones (audience, created_at desc);
create index if not exists notif_empleado_idx
  on public.notificaciones (empleado_id, created_at desc) where empleado_id is not null;
create index if not exists notif_expires_idx
  on public.notificaciones (expires_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.notificaciones enable row level security;

drop policy if exists "notif: admin lee admin" on public.notificaciones;
create policy "notif: admin lee admin"
  on public.notificaciones for select
  using (
    audience = 'admin'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin_full', 'admin_op', 'responsable')
    )
  );

drop policy if exists "notif: empleado lee suyas" on public.notificaciones;
create policy "notif: empleado lee suyas"
  on public.notificaciones for select
  using (
    audience = 'empleado'
    and exists (
      select 1 from public.empleados e
      where e.id = empleado_id and e.user_id = auth.uid()
    )
  );

-- DELETE (marcar leída) — mismas condiciones que SELECT
drop policy if exists "notif: admin borra admin" on public.notificaciones;
create policy "notif: admin borra admin"
  on public.notificaciones for delete
  using (
    audience = 'admin'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin_full', 'admin_op', 'responsable')
    )
  );

drop policy if exists "notif: empleado borra suyas" on public.notificaciones;
create policy "notif: empleado borra suyas"
  on public.notificaciones for delete
  using (
    audience = 'empleado'
    and exists (
      select 1 from public.empleados e
      where e.id = empleado_id and e.user_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- emit() — usable desde triggers y edge functions
-- ---------------------------------------------------------------------------
create or replace function public.notif_emit(
  p_audience    text,
  p_empleado_id uuid,
  p_tipo        text,
  p_titulo      text,
  p_cuerpo      text default null,
  p_payload     jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.notificaciones (audience, empleado_id, tipo, titulo, cuerpo, payload)
  values (p_audience, p_empleado_id, p_tipo, p_titulo, p_cuerpo, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- RPC: listar notificaciones del usuario actual (admin o empleado)
-- ---------------------------------------------------------------------------
create or replace function public.notificaciones_listar()
returns table (
  id          uuid,
  audience    text,
  empleado_id uuid,
  tipo        text,
  titulo      text,
  cuerpo      text,
  payload     jsonb,
  created_at  timestamptz
)
language sql security invoker stable as $$
  select n.id, n.audience, n.empleado_id, n.tipo, n.titulo, n.cuerpo, n.payload, n.created_at
  from public.notificaciones n
  where n.expires_at > now()
  order by n.created_at desc
  limit 100;
$$;


-- ---------------------------------------------------------------------------
-- Función purga (borra expiradas) — invocar desde pg_cron diario
-- ---------------------------------------------------------------------------
create or replace function public.notificaciones_purgar_antiguas()
returns int
language plpgsql security definer set search_path = public as $$
declare v_deleted int;
begin
  delete from public.notificaciones where expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


-- ============================================================================
-- TRIGGERS AUTOMÁTICOS
-- ============================================================================

-- Vacaciones — empleado solicita → admins ; admin cambia estado → empleado
-- ----------------------------------------------------------------------------
create or replace function public.notif_vacaciones_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_emp_nombre text;
  v_rango      text;
begin
  select nombre into v_emp_nombre from public.empleados where id = new.empleado_id;
  v_rango := to_char(new.fecha_inicio, 'DD/MM/YYYY') ||
             ' → ' || to_char(new.fecha_fin, 'DD/MM/YYYY') ||
             ' (' || new.dias || 'd)';

  if tg_op = 'INSERT' and new.estado = 'pendiente' then
    perform public.notif_emit(
      'admin', null, 'vacaciones_solicitada',
      'Solicitud de vacaciones — ' || coalesce(v_emp_nombre, '?'),
      v_rango || coalesce(' · ' || nullif(new.nota, ''), ''),
      jsonb_build_object('vacacion_id', new.id, 'empleado_id', new.empleado_id)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'aprobado' then
      perform public.notif_emit(
        'empleado', new.empleado_id, 'vacaciones_aprobada',
        '✅ Vacaciones aprobadas',
        v_rango,
        jsonb_build_object('vacacion_id', new.id)
      );
    elsif new.estado = 'denegado' then
      perform public.notif_emit(
        'empleado', new.empleado_id, 'vacaciones_denegada',
        '❌ Vacaciones denegadas',
        v_rango || coalesce(' · ' || nullif(new.nota, ''), ''),
        jsonb_build_object('vacacion_id', new.id)
      );
    end if;
  end if;

  return new;
end;
$$;

-- Permitir 'denegado' en el check existente
alter table public.trabajadores_vacaciones drop constraint if exists trabajadores_vacaciones_estado_check;
alter table public.trabajadores_vacaciones add constraint trabajadores_vacaciones_estado_check
  check (estado in ('pendiente', 'aprobado', 'disfrutado', 'denegado'));

drop trigger if exists notif_vacaciones on public.trabajadores_vacaciones;
create trigger notif_vacaciones
  after insert or update on public.trabajadores_vacaciones
  for each row execute function public.notif_vacaciones_trigger();


-- Puntos — al puntuar al empleado, notif al empleado con desglose
-- Idempotente por (empleado, fecha): si ya existe notif del día, la reemplaza.
-- ----------------------------------------------------------------------------
create or replace function public.notif_puntos_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_titulo text;
  v_cuerpo text;
begin
  -- limpia notif previa del día por si se baja a 0 desde un valor positivo
  delete from public.notificaciones
   where audience = 'empleado'
     and empleado_id = new.empleado_id
     and tipo = 'puntos_dia'
     and (payload->>'fecha')::date = new.fecha;

  -- si el día queda a 0 puntos, no spamear con "0 puntos hoy"
  if new.total = 0 then
    return new;
  end if;

  v_titulo := '⭐ ' || new.total || ' puntos hoy';
  v_cuerpo := 'Puntualidad ' || new.puntualidad ||
              ' · Reparto ' || new.reparto ||
              ' · Responsabilidad ' || new.responsabilidad ||
              coalesce(' · ' || nullif(new.nota, ''), '');

  perform public.notif_emit(
    'empleado', new.empleado_id, 'puntos_dia',
    v_titulo, v_cuerpo,
    jsonb_build_object('fecha', new.fecha, 'total', new.total)
  );
  return new;
end;
$$;

drop trigger if exists notif_puntos on public.trabajadores_puntos_dias;
create trigger notif_puntos
  after insert or update on public.trabajadores_puntos_dias
  for each row execute function public.notif_puntos_trigger();


-- Tareas — al pasar a 'hecha', notif a admins
-- ----------------------------------------------------------------------------
create or replace function public.notif_tareas_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_emp text;
begin
  if new.estado <> 'hecha'::public.tarea_estado then return new; end if;
  if tg_op = 'UPDATE' and old.estado = 'hecha'::public.tarea_estado then return new; end if;

  -- si quien la marca es admin/responsable, no notificar (evita self-spam):
  -- los admins ya saben lo que han marcado. Solo notif si la cierra un empleado.
  if exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin_full', 'admin_op', 'responsable')
  ) then
    return new;
  end if;

  if new.asignado_a is not null then
    select nombre into v_emp from public.empleados where id = new.asignado_a;
  end if;

  perform public.notif_emit(
    'admin', null, 'tarea_completada',
    '✔️ Tarea completada',
    new.titulo || coalesce(' — ' || v_emp, ''),
    jsonb_build_object('tarea_id', new.id, 'asignado_a', new.asignado_a)
  );
  return new;
end;
$$;

drop trigger if exists notif_tareas on public.tareas;
create trigger notif_tareas
  after insert or update of estado on public.tareas
  for each row execute function public.notif_tareas_trigger();


-- ---------------------------------------------------------------------------
-- Snapshot por empleado para la edge function IA (últimos 7 días)
-- Devuelve datos crudos; la IA decide si emitir mensaje motivador/penalizador.
-- ---------------------------------------------------------------------------
create or replace function public.notif_snapshot_empleado(p_empleado_id uuid)
returns jsonb
language sql security definer set search_path = public stable as $$
  with emp as (
    select id, nombre, pack, limite_credito_mensual, tarifa_sabado
    from public.empleados where id = p_empleado_id
  ),
  pts as (
    select
      sum(total)::int                  as pts_7d,
      count(*)::int                    as dias_puntuados_7d,
      sum(puntualidad)::int            as pts_puntualidad,
      sum(reparto)::int                as pts_reparto,
      sum(responsabilidad)::int        as pts_responsabilidad
    from public.trabajadores_puntos_dias
    where empleado_id = p_empleado_id
      and fecha >= current_date - interval '7 days'
  ),
  vac_proximas as (
    select count(*)::int as n
    from public.trabajadores_vacaciones
    where empleado_id = p_empleado_id
      and estado = 'aprobado'
      and fecha_inicio between current_date and current_date + interval '14 days'
  ),
  cred as (
    select coalesce(sum(total), 0)::numeric as gastado_mes
    from public.trabajadores_credito_facturas
    where empleado_id = p_empleado_id
      and date_trunc('month', fecha) = date_trunc('month', current_date)
  ),
  sab as (
    select count(*)::int as n_sabados_mes
    from public.trabajadores_sabados_trabajados
    where empleado_id = p_empleado_id
      and date_trunc('month', fecha) = date_trunc('month', current_date)
  )
  select jsonb_build_object(
    'empleado',        (select to_jsonb(e) from emp e),
    'puntos_7d',       (select to_jsonb(p) from pts p),
    'vacaciones_proximas_14d', (select n from vac_proximas),
    'credito_gastado_mes',     (select gastado_mes from cred),
    'sabados_trabajados_mes',  (select n_sabados_mes from sab)
  );
$$;


-- ---------------------------------------------------------------------------
-- Lista de empleados activos para iterar (helper edge function)
-- ---------------------------------------------------------------------------
create or replace function public.notif_empleados_activos()
returns table (id uuid, nombre text, pack smallint)
language sql security definer set search_path = public stable as $$
  select id, nombre, pack from public.empleados where activo = true order by nombre;
$$;
