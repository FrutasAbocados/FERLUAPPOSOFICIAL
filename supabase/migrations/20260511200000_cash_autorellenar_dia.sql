-- RPC: cash_autorellenar_dia(p_fecha)
-- Agrega en un solo viaje todos los datos que el calendario de caja
-- puede pre-rellenar automáticamente para un día dado:
--   · efectivo / tarjeta  →  repartos_jornada_lineas (Cierre día)
--   · compras             →  manager_facturas tipo=COMPRA (Holded sync)
--   · pedidos             →  count VENTA del día (excluyendo notas crédito y abuelo)
--   · deuda_generada      →  payments_pending de ventas del día (lo que sigue sin cobrar)

create or replace function cash_autorellenar_dia(p_fecha date)
returns table(
  efectivo       numeric,
  tarjeta        numeric,
  compras        numeric,
  pedidos        integer,
  deuda_generada numeric
)
language sql security invoker stable
as $$
  select
    -- Efectivo cobrado en repartos de ese día
    coalesce(
      (select sum(l.importe) filter (where l.forma_pago = 'efectivo')
         from repartos_jornada j
         join repartos_jornada_lineas l on l.jornada_id = j.id
        where j.fecha = p_fecha),
      0
    ),
    -- Tarjeta cobrada en repartos de ese día
    coalesce(
      (select sum(l.importe) filter (where l.forma_pago = 'tarjeta')
         from repartos_jornada j
         join repartos_jornada_lineas l on l.jornada_id = j.id
        where j.fecha = p_fecha),
      0
    ),
    -- Total compras (con IVA) sincronizadas desde Holded
    coalesce(
      (select sum(f.total)
         from manager_facturas f
        where f.tipo = 'COMPRA' and f.fecha = p_fecha),
      0
    ),
    -- Número de documentos de venta (albaranes + facturas, sin notas crédito ni abuelo)
    coalesce(
      (select count(*)::integer
         from manager_facturas f
        where f.tipo = 'VENTA'
          and f.fecha = p_fecha
          and f.subtipo not in ('creditnote', 'abuelo')),
      0
    ),
    -- Importe pendiente de cobro de las ventas del día
    coalesce(
      (select sum(f.payments_pending)
         from manager_facturas f
        where f.tipo = 'VENTA'
          and f.fecha = p_fecha
          and f.subtipo not in ('creditnote', 'abuelo')),
      0
    );
$$;
