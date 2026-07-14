-- Vacaciones de cliente como RANGO (desde → hasta), no solo "hasta".
-- Permite programar por adelantado ("cierra del 1 al 20 de agosto") en vez de
-- tener que acordarse de marcarlo el mismo día que el cliente se va.
--
-- Retrocompatible con las filas que ya sólo tienen `hasta`:
--   solo hasta  → en pausa hasta esa fecha (comportamiento actual)
--   solo desde  → en pausa indefinida a partir de esa fecha
--   ambas       → en pausa dentro del rango (inclusive)
--   ninguna     → sin pausa

alter table public.clientes_preferencias
  add column if not exists en_pausa_desde date;

-- Una pausa que acaba antes de empezar es siempre un error de tecleo.
alter table public.clientes_preferencias
  drop constraint if exists clientes_preferencias_pausa_rango_chk;
alter table public.clientes_preferencias
  add constraint clientes_preferencias_pausa_rango_chk
  check (en_pausa_desde is null or en_pausa_hasta is null or en_pausa_hasta >= en_pausa_desde);

-- Fuente única de verdad de "¿está este cliente en pausa en la fecha X?".
-- La replican el frontend y las dos RPCs de seguimiento: si cambia la regla,
-- cambia aquí.
create or replace function public.cliente_en_pausa(
  p_desde date,
  p_hasta date,
  p_fecha date default current_date
)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select (p_desde is not null or p_hasta is not null)
     and (p_desde is null or p_fecha >= p_desde)
     and (p_hasta is null or p_fecha <= p_hasta);
$function$;

-- ── clientes_seguimiento_v2: excluye del seguimiento a quien está en pausa hoy ──
create or replace function public.clientes_seguimiento_v2(p_dias_activo integer default 90)
returns table(
  contact_name_canon text,
  ult_pedido date,
  dias_sin_pedir integer,
  cadencia_dias numeric,
  pedidos_activo integer,
  ventas_activo numeric,
  llamado_seguimiento_at timestamp with time zone
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with base as (
    select coalesce(a.alias_to, f.contact_name) as cn, f.fecha, f.subtotal
    from public.manager_facturas f
    left join public.manager_clientes_alias a on a.alias_from = f.contact_name
    where public.puede_ver_clientes()
      and f.tipo = 'VENTA'
      and f.contact_name is not null
      and f.fecha >= current_date - make_interval(days => p_dias_activo)
  ),
  agg as (
    select cn,
           max(fecha)::date       as ult_pedido,
           min(fecha)::date       as primer_pedido,
           count(distinct fecha)  as dias_con_pedido,
           count(*)::int          as pedidos_activo,
           sum(subtotal)::numeric as ventas_activo
    from base
    group by cn
  ),
  con_cad as (
    select cn, ult_pedido, primer_pedido, pedidos_activo, ventas_activo,
           case when dias_con_pedido >= 2 and (ult_pedido - primer_pedido) > 0
                then (ult_pedido - primer_pedido)::numeric / (dias_con_pedido - 1)
           end as cadencia_dias
    from agg
    where pedidos_activo >= 2 and dias_con_pedido >= 2
  )
  select c.cn,
         c.ult_pedido,
         (current_date - c.ult_pedido)::int as dias_sin_pedir,
         c.cadencia_dias,
         c.pedidos_activo,
         c.ventas_activo,
         prog.llamado_seguimiento_at
  from con_cad c
  left join public.clientes_preferencias pref on pref.contact_name_canon = c.cn
  left join public.clientes_programa     prog on prog.contact_name_canon = c.cn
  where (prog.excluido_seguimiento is null or not prog.excluido_seguimiento)
    and not public.cliente_en_pausa(pref.en_pausa_desde, pref.en_pausa_hasta)
    and (current_date - c.ult_pedido) > 0
  order by (current_date - c.ult_pedido) desc, c.ventas_activo desc;
$function$;

-- ── clientes_seguimiento_semanal: añade en_pausa_desde a la salida ──
-- Cambia el RETURNS TABLE → drop + create.
drop function if exists public.clientes_seguimiento_semanal(integer, integer);

create function public.clientes_seguimiento_semanal(
  p_dias_umbral integer default 7,
  p_dias_activo integer default 90
)
returns table(
  contact_name_canon text,
  ult_pedido date,
  dias_sin_pedir integer,
  cadencia_dias numeric,
  pedidos_activo integer,
  ventas_activo numeric,
  en_pausa_desde date,
  en_pausa_hasta date,
  estado text
)
language sql
stable
set search_path to 'public'
as $function$
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
    select
      cn,
      max(fecha)::date as ult_pedido,
      min(fecha)::date as primer_pedido,
      count(*)::int as pedidos_activo,
      sum(subtotal)::numeric as ventas_activo
    from base
    group by cn
  ),
  con_cadencia as (
    select
      cn, ult_pedido, pedidos_activo, ventas_activo,
      case
        when pedidos_activo >= 2
          then ((ult_pedido - primer_pedido)::numeric / (pedidos_activo - 1))
        else null
      end as cadencia_dias
    from agg
  ),
  prefs as (
    select contact_name_canon, en_pausa_desde, en_pausa_hasta
    from public.clientes_preferencias
  )
  select
    c.cn,
    c.ult_pedido,
    (current_date - c.ult_pedido)::int,
    c.cadencia_dias,
    c.pedidos_activo,
    c.ventas_activo,
    p.en_pausa_desde,
    p.en_pausa_hasta,
    case
      when public.cliente_en_pausa(p.en_pausa_desde, p.en_pausa_hasta) then 'pausa'
      when (current_date - c.ult_pedido) <= p_dias_umbral               then 'pidiendo'
      else                                                                  'sin_pedir'
    end
  from con_cadencia c
  left join prefs p on p.contact_name_canon = c.cn
  order by (current_date - c.ult_pedido) desc, c.ventas_activo desc;
$function$;
