-- Defensa en profundidad para RPCs de seguimiento de clientes.
-- Las RPCs solo devuelven datos si el usuario actual pasa puede_ver_clientes().

create or replace function public.clientes_seguimiento_v2(p_dias_activo integer default 90)
returns table(
  contact_name_canon text,
  ult_pedido date,
  dias_sin_pedir integer,
  cadencia_dias numeric,
  pedidos_activo integer,
  ventas_activo numeric,
  llamado_seguimiento_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
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
    and (pref.en_pausa_hasta is null or pref.en_pausa_hasta < current_date)
    and (current_date - c.ult_pedido) > 0
  order by (current_date - c.ult_pedido) desc, c.ventas_activo desc;
$$;

create or replace function public.clientes_seguimiento_excluidos()
returns table(
  contact_name_canon text,
  motivo_exclusion text,
  excluido_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select contact_name_canon, motivo_exclusion, updated_at
  from public.clientes_programa
  where public.puede_ver_clientes()
    and excluido_seguimiento = true
  order by updated_at desc;
$$;

revoke execute on function public.clientes_seguimiento_semanal(integer, integer) from public, anon;
grant execute on function public.clientes_seguimiento_semanal(integer, integer) to authenticated, service_role;

revoke execute on function public.clientes_seguimiento_v2(integer) from public, anon;
grant execute on function public.clientes_seguimiento_v2(integer) to authenticated, service_role;

revoke execute on function public.clientes_seguimiento_excluidos() from public, anon;
grant execute on function public.clientes_seguimiento_excluidos() to authenticated, service_role;
