-- Cola de facturas de proveedor procesada en servidor.
--
-- Antes la tanda corría en el navegador: al salir de la app (o del móvil) se
-- cortaba. Ahora el cliente solo sube cada PDF a Storage y deja una fila aquí;
-- el worker `compras-cola-worker` hace OCR → guardar → Holded aunque nadie
-- tenga la app abierta. Al acabar la tanda se inserta una notificación admin
-- (push al móvil por el trigger de `notificaciones`).

create table if not exists public.pedidos_wa_compras_cola_lotes (
  id            uuid primary key default gen_random_uuid(),
  total         int  not null check (total > 0),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  notificado_at timestamptz
);

create table if not exists public.pedidos_wa_compras_cola (
  id            uuid primary key default gen_random_uuid(),
  lote_id       uuid not null references public.pedidos_wa_compras_cola_lotes(id) on delete cascade,
  orden         int  not null default 0,
  nombre        text not null,
  storage_path  text not null,
  estado        text not null default 'espera'
                check (estado in ('espera','ocr','guardando','subiendo','ok','revisar','error','cancelado')),
  detalle       text,
  intentos      int  not null default 0,
  started_at    timestamptz,
  compra_id     uuid references public.pedidos_wa_compras(id) on delete set null,
  proveedor     text,
  num_factura   text,
  total         numeric,
  holded_num    text,
  oculto        boolean not null default false,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists pedidos_wa_compras_cola_pendientes
  on public.pedidos_wa_compras_cola (created_at)
  where estado in ('espera','ocr','guardando','subiendo');
create index if not exists pedidos_wa_compras_cola_lote
  on public.pedidos_wa_compras_cola (lote_id, orden);

create or replace function public.pedidos_wa_compras_cola_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pedidos_wa_compras_cola_touch on public.pedidos_wa_compras_cola;
create trigger pedidos_wa_compras_cola_touch
  before update on public.pedidos_wa_compras_cola
  for each row execute function public.pedidos_wa_compras_cola_touch_updated();

alter table public.pedidos_wa_compras_cola_lotes enable row level security;
alter table public.pedidos_wa_compras_cola       enable row level security;

drop policy if exists "pedidos_wa_compras_cola_lotes: admin rw" on public.pedidos_wa_compras_cola_lotes;
create policy "pedidos_wa_compras_cola_lotes: admin rw" on public.pedidos_wa_compras_cola_lotes
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "pedidos_wa_compras_cola: admin rw" on public.pedidos_wa_compras_cola;
create policy "pedidos_wa_compras_cola: admin rw" on public.pedidos_wa_compras_cola
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- Reclama el siguiente trabajo (solo el worker, con service_role).
-- Un trabajo colgado en OCR/guardado se reintenta (máx. 3 intentos). Uno que
-- se colgó mientras subía a Holded NO se reintenta: Holded no es idempotente
-- y podría duplicar la factura de compra; queda en «revisar».
create or replace function public.pedidos_wa_compras_cola_reclamar()
returns setof public.pedidos_wa_compras_cola
language plpgsql security definer set search_path = public as $$
begin
  update public.pedidos_wa_compras_cola
     set estado = 'revisar',
         detalle = 'Se cortó mientras subía a Holded — comprueba en Holded antes de volver a subirla'
   where estado = 'subiendo' and started_at < now() - interval '5 minutes';

  update public.pedidos_wa_compras_cola
     set estado = 'error',
         detalle = coalesce(detalle, 'Se cortó tres veces — reintenta a mano')
   where estado in ('ocr','guardando') and started_at < now() - interval '5 minutes'
     and intentos >= 3;

  return query
  update public.pedidos_wa_compras_cola c
     set estado = 'ocr', detalle = null, intentos = c.intentos + 1, started_at = now()
   where c.id = (
     select id from public.pedidos_wa_compras_cola
      where estado = 'espera'
         or (estado in ('ocr','guardando') and started_at < now() - interval '5 minutes')
      order by created_at, orden
      limit 1
      for update skip locked
   )
  returning c.*;
end;
$$;

-- Cierra el lote una sola vez cuando no queda nada pendiente y avisa al móvil.
create or replace function public.pedidos_wa_compras_cola_cerrar_lote(p_lote uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_ok int; v_rev int; v_err int; v_total int; v_cuerpo text;
begin
  if exists (select 1 from public.pedidos_wa_compras_cola
              where lote_id = p_lote and estado in ('espera','ocr','guardando','subiendo')) then
    return false;
  end if;

  update public.pedidos_wa_compras_cola_lotes
     set notificado_at = now()
   where id = p_lote and notificado_at is null;
  if not found then return false; end if;

  select count(*) filter (where estado = 'ok'),
         count(*) filter (where estado = 'revisar'),
         count(*) filter (where estado in ('error','cancelado')),
         count(*)
    into v_ok, v_rev, v_err, v_total
    from public.pedidos_wa_compras_cola where lote_id = p_lote;

  v_cuerpo := v_ok || ' de ' || v_total || ' subidas a Holded'
    || case when v_rev > 0 then ' · ' || v_rev || ' para revisar' else '' end
    || case when v_err > 0 then ' · ' || v_err || ' con error' else '' end;

  insert into public.notificaciones (audience, tipo, titulo, cuerpo, payload)
  values ('admin', 'compras_cola', 'Facturas de proveedor procesadas', v_cuerpo,
          jsonb_build_object('url', '/pedidos-wa?tab=compras-prov', 'lote_id', p_lote));
  return true;
end;
$$;

-- Ambas solo para el worker. Una tanda cancelada a mano no avisa: quien la
-- cancela ya está mirando la app.
revoke all on function public.pedidos_wa_compras_cola_reclamar() from public, anon, authenticated;
grant execute on function public.pedidos_wa_compras_cola_reclamar() to service_role;
revoke all on function public.pedidos_wa_compras_cola_cerrar_lote(uuid) from public, anon, authenticated;
grant execute on function public.pedidos_wa_compras_cola_cerrar_lote(uuid) to service_role;

-- Red de seguridad: si el worker se cae o nadie lo despierta, el cron lo
-- relanza cada minuto mientras haya trabajo.
select cron.unschedule('compras-cola-worker')
 where exists (select 1 from cron.job where jobname = 'compras-cola-worker');
select cron.schedule(
  'compras-cola-worker',
  '* * * * *',
  $cron$
  select net.http_post(
    url     := 'https://ucjkyjhvvdofyaizzdbk.supabase.co/functions/v1/compras-cola-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  )
  where exists (
    select 1 from public.pedidos_wa_compras_cola
     where estado = 'espera'
        or (estado in ('ocr','guardando','subiendo') and started_at < now() - interval '5 minutes')
  );
  $cron$
);
