-- Módulo Clientes — preferencias + notas + RPC seguimiento semanal
-- Permisos: admin_full + admin_op (vía is_admin()). Sin acceso para empleado.

-- 1) PREFERENCIAS por cliente
create table if not exists public.clientes_preferencias (
  contact_name_canon  text primary key,
  hora_preferida      text,
  dia_preferido       text,
  tags                text[] not null default '{}',
  en_pausa_hasta      date,
  notas               text,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id) on delete set null
);

create or replace function public.clientes_pref_touch_updated() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;

drop trigger if exists clientes_pref_touch on public.clientes_preferencias;
create trigger clientes_pref_touch before update on public.clientes_preferencias
  for each row execute function public.clientes_pref_touch_updated();

alter table public.clientes_preferencias enable row level security;

drop policy if exists "clientes_pref: admin rw" on public.clientes_preferencias;
create policy "clientes_pref: admin rw" on public.clientes_preferencias for all
  using (is_admin()) with check (is_admin());


-- 2) NOTAS INTERNAS
create table if not exists public.clientes_notas_internas (
  id                  uuid primary key default gen_random_uuid(),
  contact_name_canon  text not null,
  autor               uuid references auth.users(id) on delete set null,
  texto               text not null,
  created_at          timestamptz not null default now()
);

create index if not exists clientes_notas_canon_idx on public.clientes_notas_internas (contact_name_canon, created_at desc);

alter table public.clientes_notas_internas enable row level security;

drop policy if exists "clientes_notas: admin rw" on public.clientes_notas_internas;
create policy "clientes_notas: admin rw" on public.clientes_notas_internas for all
  using (is_admin()) with check (is_admin());


-- 3) RPC seguimiento semanal
drop function if exists public.clientes_seguimiento_semanal(int, int);
create or replace function public.clientes_seguimiento_semanal(
  p_dias_umbral int default 7,
  p_dias_activo int default 90
)
returns table (
  contact_name_canon text,
  ult_pedido         date,
  dias_sin_pedir     int,
  cadencia_dias      numeric,
  pedidos_activo     int,
  ventas_activo      numeric,
  en_pausa_hasta     date,
  estado             text
)
language sql security invoker stable as $$
  with base as (
    select
      coalesce(a.alias_to, f.contact_name) as cn,
      f.fecha,
      f.subtotal
    from public.manager_facturas f
    left join public.manager_clientes_alias a on a.alias_from = f.contact_name
    where f.tipo = 'VENTA'
      and f.contact_name is not null
      and f.fecha >= current_date - make_interval(days => p_dias_activo)
  ),
  agg as (
    select cn, max(fecha)::date as ult_pedido, min(fecha)::date as primer_pedido,
           count(*)::int as pedidos_activo, sum(subtotal)::numeric as ventas_activo
    from base group by cn
  ),
  con_cadencia as (
    select cn, ult_pedido, pedidos_activo, ventas_activo,
      case when pedidos_activo >= 2
        then ((ult_pedido - primer_pedido)::numeric / (pedidos_activo - 1))
        else null end as cadencia_dias
    from agg
  ),
  prefs as (select contact_name_canon, en_pausa_hasta from public.clientes_preferencias)
  select
    c.cn, c.ult_pedido, (current_date - c.ult_pedido)::int, c.cadencia_dias,
    c.pedidos_activo, c.ventas_activo, p.en_pausa_hasta,
    case
      when p.en_pausa_hasta is not null and p.en_pausa_hasta >= current_date  then 'pausa'
      when (current_date - c.ult_pedido) <= p_dias_umbral                     then 'pidiendo'
      else                                                                         'sin_pedir'
    end
  from con_cadencia c
  left join prefs p on p.contact_name_canon = c.cn
  order by (current_date - c.ult_pedido) desc, c.ventas_activo desc;
$$;

grant execute on function public.clientes_seguimiento_semanal(int, int) to authenticated;
