-- Limpieza auditoría 2026-05-07 noche.
-- 2 RPCs zombi confirmadas (verificación triple: 0 refs src/, 0 refs supabase/, 0 callers internos).
--
-- pedidos_wa_resolver_precios: superseded by pedidos_wa_resolver_completo
--   (introducida 20260507120100 como parche, sustituida 20260507210000)
-- gastos_agrupado: nunca tuvo consumidor frontend (creada 20260505200000),
--   el frontend usa gastos_resumen_periodo

drop function if exists public.pedidos_wa_resolver_precios(uuid);
drop function if exists public.gastos_agrupado(date, date, text);
