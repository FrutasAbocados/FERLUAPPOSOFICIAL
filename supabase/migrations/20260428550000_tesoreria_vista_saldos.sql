-- Vista que calcula saldo_actual = saldo_inicial + SUM(movimientos.importe)
-- en SQL en lugar de traerse todos los movimientos al cliente.
-- security_invoker=true para que RLS de las tablas subyacentes se aplique al
-- usuario que consulta (no al owner de la vista).

create or replace view public.tesoreria_cuentas_con_saldo
with (security_invoker = true)
as
select
  c.id,
  c.nombre,
  c.tipo,
  c.saldo_inicial,
  c.limite_credito,
  c.activo,
  c.orden,
  c.notas,
  c.created_at,
  c.updated_at,
  c.saldo_inicial + coalesce((
    select sum(m.importe)
    from public.tesoreria_movimientos m
    where m.cuenta_id = c.id
  ), 0) as saldo_actual
from public.tesoreria_cuentas c;
