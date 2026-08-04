-- Inicia Tesorería a 0 EUR el 14/07/2026 sin borrar el histórico.
-- El importe se calcula en el momento de aplicar la migración para compensar
-- exactamente el saldo acumulado existente.

insert into public.tesoreria_movimientos (
  fecha,
  tipo,
  concepto,
  importe,
  categoria,
  notas,
  fuente,
  ajuste
)
select
  date '2026-07-14',
  case when saldo_actual > 0 then 'salida' else 'entrada' end,
  'Ajuste de apertura · Inicio 14/07/2026',
  abs(saldo_actual),
  'otros',
  'Saldo de Tesorería fijado en 0 EUR al comenzar el control el 14/07/2026.',
  'manual',
  true
from (
  select coalesce(sum(
    case when tipo = 'entrada' then importe else -importe end
  ), 0)::numeric(14,2) as saldo_actual
  from public.tesoreria_movimientos
) saldo
where saldo_actual <> 0
  and not exists (
    select 1
    from public.tesoreria_movimientos
    where concepto = 'Ajuste de apertura · Inicio 14/07/2026'
      and ajuste = true
  );
