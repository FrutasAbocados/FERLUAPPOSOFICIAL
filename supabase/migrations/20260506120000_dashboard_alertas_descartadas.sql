-- Sistema "no me interesa esta alerta" para Dashboard
-- Filtra entidades descartadas en frontend (no toca las 5 RPCs Dashboard).
create table if not exists public.dashboard_alertas_descartadas (
  alert_type      text not null,
  entity_id       text not null,
  descartada_at   timestamptz not null default now(),
  descartada_por  uuid references auth.users(id) on delete set null,
  motivo          text,
  primary key (alert_type, entity_id)
);

create index if not exists dash_alertas_desc_type_idx
  on public.dashboard_alertas_descartadas (alert_type);

alter table public.dashboard_alertas_descartadas enable row level security;

drop policy if exists "dash_alertas_desc: admin rw" on public.dashboard_alertas_descartadas;
create policy "dash_alertas_desc: admin rw" on public.dashboard_alertas_descartadas for all
  using (is_admin()) with check (is_admin());

drop policy if exists "dash_alertas_desc: responsable read" on public.dashboard_alertas_descartadas;
create policy "dash_alertas_desc: responsable read" on public.dashboard_alertas_descartadas for select
  using (es_responsable());
