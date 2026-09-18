-- ============================================================================
-- Informe diario de margen → PDF en Storage privado + enlace por WhatsApp
-- ============================================================================
-- - informe_margen_diario(fecha): factura a factura del día + acumulado del mes
--   por cliente. Solo invoice/salesreceipt/waybill (sin ventas internas abuelo).
--   Margen % sobre ventas con coste resuelto (regla Manager).
-- - Bucket privado `informes-margen`; el enlace es una URL firmada temporal.
-- - Envío por CallMeBot: phone/apikey en Vault (`callmebot_phone`,
--   `callmebot_apikey`), leídos solo por service_role.
-- - Cron a las 22:00 Europe/Madrid (dos horarios UTC por el cambio de hora,
--   filtrados por la hora local). Un envío OK por fecha.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('informes-margen', 'informes-margen', false)
on conflict (id) do nothing;

create table if not exists public.informe_margen_envios (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  trigger      text not null default 'cron',
  estado       text not null check (estado in ('ok', 'error', 'sin_ventas')),
  storage_path text,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists informe_margen_envios_fecha_idx
  on public.informe_margen_envios (fecha, created_at desc);

alter table public.informe_margen_envios enable row level security;

drop policy if exists "informe_margen_envios: admin read" on public.informe_margen_envios;
create policy "informe_margen_envios: admin read"
  on public.informe_margen_envios for select to authenticated
  using (public.is_admin());

create or replace function public.informe_margen_diario(p_fecha date)
returns jsonb
language sql
security invoker
stable
as $$
  with lineas as (
    select
      l.factura_id,
      l.subtipo,
      l.fecha,
      coalesce(nullif(l.contact_name_canon, ''), nullif(l.contact_name_raw, ''), '(sin cliente)') as cliente,
      coalesce(l.subtotal, 0)            as subtotal,
      coalesce(l.margen_linea, 0)        as margen,
      coalesce(l.subtotal_con_coste, 0)  as base_coste,
      (l.coste_unidad is null or coalesce(l.subtotal_con_coste, 0) < coalesce(l.subtotal, 0)) as pendiente
    from public.manager_lineas_efectivas l
    where l.tipo = 'VENTA'
      and l.subtipo in ('invoice', 'salesreceipt', 'waybill')
      and l.fecha between date_trunc('month', p_fecha)::date and p_fecha
  ),
  docs as (
    select
      l.factura_id,
      f.doc_number,
      l.subtipo,
      l.cliente,
      sum(l.subtotal)   as ventas,
      sum(l.margen)     as margen,
      sum(l.base_coste) as base_coste,
      count(*)          as lineas,
      count(*) filter (where l.pendiente) as lineas_pendientes
    from lineas l
    left join public.manager_facturas f on f.id = l.factura_id
    where l.fecha = p_fecha
    group by l.factura_id, f.doc_number, l.subtipo, l.cliente
  ),
  mes as (
    select
      l.cliente,
      count(distinct l.factura_id) as documentos,
      sum(l.subtotal)   as ventas,
      sum(l.margen)     as margen,
      sum(l.base_coste) as base_coste,
      sum(l.subtotal)   filter (where l.fecha = p_fecha) as ventas_dia,
      count(*) filter (where l.pendiente) as lineas_pendientes
    from lineas l
    group by l.cliente
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'mes_desde', date_trunc('month', p_fecha)::date,
    'dia', (
      select jsonb_build_object(
        'documentos', count(*),
        'ventas', round(coalesce(sum(ventas), 0), 2),
        'margen', round(coalesce(sum(margen), 0), 2),
        'base_coste', round(coalesce(sum(base_coste), 0), 2),
        'lineas_pendientes', coalesce(sum(lineas_pendientes), 0)
      ) from docs
    ),
    'mes_total', (
      select jsonb_build_object(
        'documentos', coalesce(sum(documentos), 0),
        'ventas', round(coalesce(sum(ventas), 0), 2),
        'margen', round(coalesce(sum(margen), 0), 2),
        'base_coste', round(coalesce(sum(base_coste), 0), 2)
      ) from mes
    ),
    'facturas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'doc_number', coalesce(doc_number, factura_id),
        'subtipo', subtipo,
        'cliente', cliente,
        'ventas', round(ventas, 2),
        'margen', round(margen, 2),
        'base_coste', round(base_coste, 2),
        'lineas', lineas,
        'lineas_pendientes', lineas_pendientes
      ) order by cliente, doc_number)
      from docs
    ), '[]'::jsonb),
    'clientes_mes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cliente', cliente,
        'documentos', documentos,
        'ventas', round(ventas, 2),
        'margen', round(margen, 2),
        'base_coste', round(base_coste, 2),
        'ventas_dia', round(coalesce(ventas_dia, 0), 2),
        'lineas_pendientes', lineas_pendientes
      ) order by ventas desc)
      from mes
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.informe_margen_diario(date) from public, anon;
grant execute on function public.informe_margen_diario(date) to authenticated, service_role;

-- Config de envío desde Vault; solo service_role.
create or replace function public.informe_margen_callmebot_config()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'phone',  (select decrypted_secret from vault.decrypted_secrets where name = 'callmebot_phone' limit 1),
    'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'callmebot_apikey' limit 1)
  )
$$;

revoke all on function public.informe_margen_callmebot_config() from public, anon, authenticated;
grant execute on function public.informe_margen_callmebot_config() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'informe-margen-diario';

select cron.schedule(
  'informe-margen-diario',
  '0 20,21 * * *',
  $cron$
  select net.http_post(
    url := 'https://ucjkyjhvvdofyaizzdbk.supabase.co/functions/v1/informe-margen-diario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 60000
  )
  where extract(hour from (now() at time zone 'Europe/Madrid')) = 22
  $cron$
);
