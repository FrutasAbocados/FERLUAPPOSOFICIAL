-- Todos los KPI de Tesorería empiezan después del ajuste de apertura.
-- El histórico se conserva, pero no cuenta como operativa nueva.

create or replace function public.tesoreria_kpis(
  p_desde date,
  p_hasta date
)
returns table (
  saldo_total numeric,
  entradas_periodo numeric,
  salidas_periodo numeric,
  count_periodo bigint
)
language sql
security invoker
stable
set search_path = public
as $function$
  with inicio as (
    select max(m.created_at) as corte
    from public.tesoreria_movimientos m
    where m.concepto = 'Ajuste de apertura · Inicio 14/07/2026'
      and m.ajuste = true
  ),
  movimientos_operativos as (
    select m.*
    from public.tesoreria_movimientos m
    cross join inicio i
    where i.corte is null or m.created_at > i.corte
  )
  select
    coalesce(sum(
      case when mo.tipo = 'entrada' then mo.importe else -mo.importe end
    ), 0),
    coalesce(sum(
      case
        when mo.tipo = 'entrada' and mo.fecha between p_desde and p_hasta
          then mo.importe
        else 0
      end
    ), 0),
    coalesce(sum(
      case
        when mo.tipo = 'salida' and mo.fecha between p_desde and p_hasta
          then mo.importe
        else 0
      end
    ), 0),
    count(*) filter (where mo.fecha between p_desde and p_hasta)
  from movimientos_operativos mo;
$function$;
