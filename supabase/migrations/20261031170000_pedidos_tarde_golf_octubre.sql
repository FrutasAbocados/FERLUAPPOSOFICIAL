-- Pedidos Tarde · octubre 2026: dos facturas de El Golf cobradas en efectivo
-- por Raúl que faltaban en el ledger. Importes congelados con el mismo cálculo
-- que usa la app (manager_lineas_coste_resuelto: subtotal - COGS), verificado
-- contra F26633 (24,72 €). Idempotente.

insert into public.trabajadores_pedidos_tarde_facturas (
  manager_factura_id, numero_factura, cliente, fecha,
  subtotal, importe_total, coste, beneficio,
  metodo_cobro, cobrada_cliente, cobrada_at, created_by
)
select v.manager_factura_id, v.numero_factura, v.cliente, v.fecha,
       v.subtotal, v.importe_total, v.coste, v.beneficio,
       'efectivo', true, now(), p.id
from (values
  ('6ad67d29428117d2fa07b1ab', 'F26683', 'Costa Social Wellness S.L (Restaurante El Golf)', date '2026-10-21', 120.75::numeric, 125.58::numeric, 75.05::numeric, 45.70::numeric),
  ('6adf0be29a899dfe1400e4b9', 'F26598', 'Costa Social Wellness S.L (Restaurante El Golf)', date '2026-10-26',  54.35::numeric,  56.52::numeric, 32.51::numeric, 21.84::numeric)
) as v(manager_factura_id, numero_factura, cliente, fecha, subtotal, importe_total, coste, beneficio)
join public.profiles p on lower(p.email) = 'raulpedper@gmail.com'
on conflict (manager_factura_id) do nothing;
