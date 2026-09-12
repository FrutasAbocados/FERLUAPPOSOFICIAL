-- Sandia blanca rayada: el override de producto (1,40 EUR, 03-jun) quedaba
-- tapado por el coste "auto" por nombre y salio a la luz al caducar este.
-- Las compras reales van a 0,55 EUR/kg, precio que Luis ya confirmo el 29-jul
-- para el nombre de venta. Deja de mandar desde el 01-09.
update public.manager_costes_manuales
set fecha_hasta = date '2026-08-31'
where fecha_hasta is null
  and product_id = '6691186a59ec8440810228e3'
  and fecha_desde = date '2026-06-03';
