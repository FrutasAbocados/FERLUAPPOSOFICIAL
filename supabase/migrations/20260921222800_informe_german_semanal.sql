-- Informe autorizado por Luis: cinco clientes, domingos 20:00 Europe/Madrid.
-- Nace pausado hasta activar CallMeBot en el teléfono de Germán y guardar
-- callmebot_german_apikey en Vault. No altera asignaciones ni comisiones.
create table public.informe_german_envios (
  fecha date primary key check (extract(isodow from fecha) = 7),
  estado text not null check (estado in ('enviando', 'aceptado', 'incierto', 'rechazado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.informe_german_envios enable row level security;
create policy "informe_german_envios: admin read"
  on public.informe_german_envios for select to authenticated using (public.is_admin());
revoke all on public.informe_german_envios from anon, authenticated;
grant select on public.informe_german_envios to authenticated;
grant select, insert, update on public.informe_german_envios to service_role;

create function public.informe_german_semanal(p_fecha date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
begin
  if p_fecha is null or extract(isodow from p_fecha) <> 7 then
    raise exception 'La fecha debe ser domingo';
  end if;
  return (
    with clientes(orden, nombre, contact_id) as (values
      (1, 'Alma 1', '697683e40a5693afe8094e01'),
      (2, 'Alma 2', '6a4eb2b2c72843bfec0502b6'),
      (3, 'Family', '69c6b636212e4af57a03eee3'),
      (4, 'La Ranita', '68cfce1655a246421200dfee'),
      (5, 'Bar Betis', '69d694779b2ff2ab940a7b0b')
    ), ventas as (
      select c.orden, c.nombre,
        round(coalesce(sum(v.subtotal) filter (where v.fecha >= p_fecha - 6), 0), 2) as semana,
        round(coalesce(sum(v.subtotal) filter (where v.fecha >= p_fecha - 13 and v.fecha < p_fecha - 6), 0), 2) as anterior,
        round(coalesce(sum(v.subtotal) filter (where v.fecha >= date_trunc('month', p_fecha)::date), 0), 2) as mes,
        count(v.id) filter (where v.fecha >= p_fecha - 6) as documentos
      from clientes c
      left join public.manager_ventas_efectivas v on v.contact_id = c.contact_id
        and v.fecha >= least(p_fecha - 13, date_trunc('month', p_fecha)::date)
        and v.fecha <= p_fecha
      group by c.orden, c.nombre
    )
    select jsonb_build_object(
      'fecha', p_fecha, 'inicio', p_fecha - 6,
      'clientes', jsonb_agg(jsonb_build_object('nombre', nombre, 'semana', semana,
        'anterior', anterior, 'mes', mes, 'documentos', documentos) order by orden),
      'total_semana', sum(semana), 'total_anterior', sum(anterior), 'total_mes', sum(mes),
      'ultima_sync', (select max(s.finished_at) from public.manager_holded_sync s
        where s.ok is true and s.range_start <= p_fecha - 13 and s.range_end >= p_fecha)
    ) from ventas
  );
end;
$$;
revoke all on function public.informe_german_semanal(date) from public, anon, authenticated;
grant execute on function public.informe_german_semanal(date) to service_role;

create function public.informe_german_callmebot_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('phone', '+34690712449', 'apikey',
    (select decrypted_secret from vault.decrypted_secrets where name = 'callmebot_german_apikey' limit 1));
$$;
revoke all on function public.informe_german_callmebot_config() from public, anon, authenticated;
grant execute on function public.informe_german_callmebot_config() to service_role;

-- UTC verano/invierno: el filtro Madrid elige una única ejecución.
select cron.schedule('informe-german-semanal', '0 18,19 * * 0', $cron$
  select net.http_post(
    url := 'https://ucjkyjhvvdofyaizzdbk.supabase.co/functions/v1/informe-german-semanal',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)),
    body := '{"send":true}'::jsonb, timeout_milliseconds := 60000
  )
  where extract(hour from now() at time zone 'Europe/Madrid') = 20
    and exists (select 1 from vault.secrets where name = 'callmebot_german_apikey');
$cron$);
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'informe-german-semanal';
