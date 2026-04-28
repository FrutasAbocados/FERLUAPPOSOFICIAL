-- ============================================================================
-- Drop módulo Tesorería
-- ============================================================================
-- Decisión usuario 2026-04-28: el módulo Tesorería no aporta valor para Ferlu.
-- Se elimina UI + tablas. Datos no usados (las tablas estaban vacías).
-- ============================================================================

drop view  if exists public.tesoreria_cuentas_con_saldo;
drop table if exists public.tesoreria_pagos        cascade;
drop table if exists public.tesoreria_movimientos  cascade;
drop table if exists public.tesoreria_gastos_fijos cascade;
drop table if exists public.tesoreria_cuentas      cascade;
drop type  if exists public.tesoreria_movimiento_tipo;
drop type  if exists public.tesoreria_cuenta_tipo;
