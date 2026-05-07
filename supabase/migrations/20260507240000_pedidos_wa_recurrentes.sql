-- Pedidos recurrentes: plantillas que generan pedidos automáticamente
-- ciertos días de la semana. Cron diario 06:30 UTC (08:30 Madrid CEST)
-- ejecuta la RPC pedidos_wa_recurrentes_generar(current_date).

create table if not exists public.pedidos_wa_recurrentes (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.pedidos_wa_clientes(id) on delete cascade,
  nombre          text not null,
  dias_semana     int[] not null,    -- {1,3,5} = lun/mié/vie. ISO: 1=lun, 7=dom
  activo          boolean not null default true,
  notas_admin     text null,
  ultima_generacion date null,
  created_by      uuid null references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists pedidos_wa_recurrentes_cliente_idx
  on public.pedidos_wa_recurrentes(cliente_id);

create or replace function public.pedidos_wa_recurrentes_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists pedidos_wa_recurrentes_touch_t on public.pedidos_wa_recurrentes;
create trigger pedidos_wa_recurrentes_touch_t
  before update on public.pedidos_wa_recurrentes
  for each row execute function public.pedidos_wa_recurrentes_touch();

create table if not exists public.pedidos_wa_recurrentes_lineas (
  id                    uuid primary key default gen_random_uuid(),
  recurrente_id         uuid not null references public.pedidos_wa_recurrentes(id) on delete cascade,
  orden                 int  not null,
  producto_normalizado  text not null,
  cantidad              numeric(10,2) not null default 1,
  unidad                text not null default 'caja',
  es_gratis             boolean not null default false,
  subseccion            text null,
  notas                 text null,
  created_at            timestamptz not null default now()
);

create index if not exists pedidos_wa_recurrentes_lineas_rec_idx
  on public.pedidos_wa_recurrentes_lineas(recurrente_id, orden);

alter table public.pedidos_wa_recurrentes        enable row level security;
alter table public.pedidos_wa_recurrentes_lineas enable row level security;

drop policy if exists "recurrentes: admin rw" on public.pedidos_wa_recurrentes;
create policy "recurrentes: admin rw"
  on public.pedidos_wa_recurrentes for all using (is_admin()) with check (is_admin());

drop policy if exists "recurrentes: responsable read" on public.pedidos_wa_recurrentes;
create policy "recurrentes: responsable read"
  on public.pedidos_wa_recurrentes for select using (es_responsable());

drop policy if exists "recurrentes_lineas: admin rw" on public.pedidos_wa_recurrentes_lineas;
create policy "recurrentes_lineas: admin rw"
  on public.pedidos_wa_recurrentes_lineas for all using (is_admin()) with check (is_admin());

drop policy if exists "recurrentes_lineas: responsable read" on public.pedidos_wa_recurrentes_lineas;
create policy "recurrentes_lineas: responsable read"
  on public.pedidos_wa_recurrentes_lineas for select using (es_responsable());

-- RPC: generar pedidos de los recurrentes activos cuyo día_semana incluye p_fecha.
-- Idempotente: si ya hay un pedido del cliente en esa fecha con texto_original
-- "(Recurrente: <id>)", no lo duplica.
create or replace function public.pedidos_wa_recurrentes_generar(p_fecha date)
returns table (
  recurrente_id uuid,
  pedido_id     uuid,
  status        text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_pedido_id uuid;
  v_dow int := extract(isodow from p_fecha)::int;
  v_marker text;
begin
  for r in
    select rec.id, rec.cliente_id, rec.nombre
    from public.pedidos_wa_recurrentes rec
    where rec.activo
      and v_dow = any(rec.dias_semana)
      and (rec.ultima_generacion is null or rec.ultima_generacion <> p_fecha)
  loop
    v_marker := '(Recurrente: ' || r.nombre || ')';

    -- Idempotencia: ya hay pedido con marker para este cliente+fecha?
    if exists (
      select 1 from public.pedidos_wa p
      where p.cliente_id = r.cliente_id
        and p.fecha = p_fecha
        and p.texto_original like '%' || v_marker || '%'
    ) then
      recurrente_id := r.id; pedido_id := null; status := 'ya_existia';
      return next;
      continue;
    end if;

    -- Crear pedido
    insert into public.pedidos_wa (cliente_id, fecha, texto_original, estado)
    values (r.cliente_id, p_fecha, v_marker, 'pendiente')
    returning id into v_pedido_id;

    -- Copiar líneas
    insert into public.pedidos_wa_lineas
      (pedido_id, orden, producto_normalizado, cantidad, unidad, es_gratis, subseccion, notas, metodo)
    select v_pedido_id, l.orden, l.producto_normalizado, l.cantidad, l.unidad,
           l.es_gratis, l.subseccion, l.notas, 'recurrente'
    from public.pedidos_wa_recurrentes_lineas l
    where l.recurrente_id = r.id
    order by l.orden;

    -- Marcar última generación
    update public.pedidos_wa_recurrentes
    set ultima_generacion = p_fecha
    where id = r.id;

    recurrente_id := r.id; pedido_id := v_pedido_id; status := 'creado';
    return next;
  end loop;
end;
$$;

grant execute on function public.pedidos_wa_recurrentes_generar(date) to authenticated;

-- Cron job: cada día 06:30 UTC (08:30 Madrid en CEST, 07:30 en CET)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job where jobname = 'pedidos-wa-recurrentes-diario';
    perform cron.schedule(
      'pedidos-wa-recurrentes-diario',
      '30 6 * * *',
      $cron$ select public.pedidos_wa_recurrentes_generar(current_date) $cron$
    );
  end if;
end $$;
