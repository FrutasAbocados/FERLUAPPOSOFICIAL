-- Log de cada intento de subir un pedido WA a Holded.
-- Lo escribe la edge function `pedido-a-holded` al final de cada invocación.
-- También se inserta una fila desde el trigger antes del pg_net.http_post para
-- saber al menos que se intentó (status=null hasta que la edge responda).

create table if not exists public.pedidos_wa_holded_log (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references public.pedidos_wa(id) on delete cascade,
  source          text not null check (source in ('trigger','manual','retry')),
  status          int  null,                      -- HTTP final (null si solo trigger o pendiente)
  ok              boolean not null default false, -- atajo legible
  doc_type        text null check (doc_type in ('invoice','waybill') or doc_type is null),
  holded_id       text null,
  holded_num      text null,
  error_msg       text null,
  request_body    jsonb null,                     -- cuerpo enviado a Holded (si llegó a enviarse)
  response_body   jsonb null,                     -- respuesta Holded resumida
  created_at      timestamptz not null default now()
);

create index if not exists pedidos_wa_holded_log_pedido_idx
  on public.pedidos_wa_holded_log(pedido_id, created_at desc);

create index if not exists pedidos_wa_holded_log_recent_idx
  on public.pedidos_wa_holded_log(created_at desc);

alter table public.pedidos_wa_holded_log enable row level security;

drop policy if exists "holded_log: admin rw" on public.pedidos_wa_holded_log;
create policy "holded_log: admin rw"
  on public.pedidos_wa_holded_log for all
  using (is_admin())
  with check (is_admin());

drop policy if exists "holded_log: responsable read" on public.pedidos_wa_holded_log;
create policy "holded_log: responsable read"
  on public.pedidos_wa_holded_log for select
  using (es_responsable());

-- Vista helper: último log por pedido (útil para mostrar estado en UI)
create or replace view public.pedidos_wa_holded_last_log as
select distinct on (pedido_id)
  pedido_id, id as log_id, source, status, ok, doc_type, holded_id, holded_num,
  error_msg, created_at
from public.pedidos_wa_holded_log
order by pedido_id, created_at desc;

grant select on public.pedidos_wa_holded_last_log to authenticated;
