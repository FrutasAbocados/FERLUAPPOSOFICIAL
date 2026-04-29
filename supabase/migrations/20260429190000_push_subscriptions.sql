-- ============================================================================
-- Push Web Subscriptions — Web Push API (PWA)
-- ============================================================================
-- Cada navegador/dispositivo registra una subscription al activar push.
-- Una persona puede tener N subscriptions (móvil + escritorio + tablet).
--
-- Trigger AFTER INSERT en notificaciones llama a la edge function
-- `notif-push-send` (vía pg_net) para enviar push real al dispositivo.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  empleado_id  uuid references public.empleados(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subs_user_idx     on public.push_subscriptions (user_id);
create index if not exists push_subs_empleado_idx on public.push_subscriptions (empleado_id) where empleado_id is not null;

alter table public.push_subscriptions enable row level security;

-- Cada usuario gestiona SUS subscriptions (insert/select/delete propias)
drop policy if exists "push_subs: usuario rw propias" on public.push_subscriptions;
create policy "push_subs: usuario rw propias"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admins pueden ver todas (para diagnóstico)
drop policy if exists "push_subs: admin lee todas" on public.push_subscriptions;
create policy "push_subs: admin lee todas"
  on public.push_subscriptions for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin_full','admin_op','responsable'))
  );


-- ---------------------------------------------------------------------------
-- RPC upsert (registra o actualiza suscripción)
-- ---------------------------------------------------------------------------
create or replace function public.push_subscription_upsert(
  p_endpoint    text,
  p_p256dh      text,
  p_auth        text,
  p_user_agent  text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid;
  v_emp_id  uuid;
begin
  if auth.uid() is null then
    raise exception 'No auth session';
  end if;

  -- Mapear user → empleado_id si existe
  select id into v_emp_id from public.empleados where user_id = auth.uid() limit 1;

  insert into public.push_subscriptions (user_id, empleado_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), v_emp_id, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        empleado_id = excluded.empleado_id,
        last_used_at = now()
  returning id into v_id;
  return v_id;
end; $$;


-- ---------------------------------------------------------------------------
-- Targets de una notificación (uuids de subs a las que mandar)
-- Reutiliza la lógica RLS conceptual: empleado='audience' → solo su user_id;
-- audience='admin' → todos los users con role admin_full/admin_op/responsable.
-- SECURITY DEFINER porque la llama la edge function con service key.
-- ---------------------------------------------------------------------------
create or replace function public.push_targets_para_notificacion(p_notif_id uuid)
returns table (
  endpoint text, p256dh text, auth text, sub_id uuid
)
language sql security definer set search_path = public stable as $$
  with n as (
    select * from public.notificaciones where id = p_notif_id
  ),
  user_ids as (
    -- empleado: el user_id del empleado dueño
    select e.user_id
      from n, public.empleados e
     where n.audience = 'empleado' and e.id = n.empleado_id and e.user_id is not null
    union
    -- admin: todos los users con role admin_full/admin_op/responsable
    select p.id
      from n, public.profiles p
     where n.audience = 'admin' and p.role in ('admin_full','admin_op','responsable')
  )
  select s.endpoint, s.p256dh, s.auth, s.id
    from public.push_subscriptions s
    join user_ids u on u.user_id = s.user_id;
$$;


-- ---------------------------------------------------------------------------
-- Borra una subscription invalidada (404/410 desde el push service)
-- ---------------------------------------------------------------------------
create or replace function public.push_subscription_delete(p_endpoint text)
returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;


-- ---------------------------------------------------------------------------
-- Trigger AFTER INSERT en notificaciones → invoca edge function via pg_net
-- (Si la extensión pg_net no está disponible, el bloque DO falla silencioso
-- y el push automático no se activa; el resto del sistema sigue funcional.)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    -- Trigger function
    execute $f$
      create or replace function public.notif_push_dispatch_trigger()
      returns trigger language plpgsql security definer set search_path = public as $body$
      declare
        v_url      text;
        v_anon_key text;
      begin
        -- Estos GUC se setean con: alter database postgres set "app.notif_push_url" = '...';
        v_url      := current_setting('app.notif_push_url', true);
        v_anon_key := current_setting('app.notif_push_anon_key', true);
        if v_url is null or v_url = '' then
          return new;
        end if;
        perform net.http_post(
          url := v_url,
          headers := jsonb_build_object('Content-Type','application/json','Authorization', 'Bearer '||coalesce(v_anon_key,'')),
          body := jsonb_build_object('notif_id', new.id)
        );
        return new;
      end; $body$;
    $f$;

    drop trigger if exists notif_push_dispatch on public.notificaciones;
    create trigger notif_push_dispatch
      after insert on public.notificaciones
      for each row execute function public.notif_push_dispatch_trigger();
  end if;
end$$;
