-- ============================================================================
-- app_settings — config runtime accesible desde funciones SQL
-- Sustituye al uso de GUC (alter database ... set) que no se permite via
-- Management API. Ahora el trigger pg_net lee la URL y anon key desde aquí.
-- ============================================================================

create table if not exists public.app_settings (
  key   text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Solo admin_full puede leer/escribir (contiene secrets como anon key)
drop policy if exists "app_settings: admin_full rw" on public.app_settings;
create policy "app_settings: admin_full rw"
  on public.app_settings for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_full'));


-- Re-crear función trigger leyendo de app_settings en vez de GUC
create or replace function public.notif_push_dispatch_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url      text;
  v_anon_key text;
begin
  select value into v_url      from public.app_settings where key = 'notif_push_url';
  select value into v_anon_key from public.app_settings where key = 'notif_push_anon_key';
  if v_url is null or v_url = '' then
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization', 'Bearer '||coalesce(v_anon_key,'')),
    body := jsonb_build_object('notif_id', new.id)
  );
  return new;
end; $$;
