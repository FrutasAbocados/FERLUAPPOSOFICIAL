-- ============================================================================
-- Auditoría meta 2026-05-05 · Limpieza de objetos zombi
-- ============================================================================
-- Detectados por el auditor `abocados-os-auditor` el 2026-05-05.
-- Ver informe: ~/.claude/projects/-Users-luis/memory/auditor_informe_2026-05-05.md
-- ============================================================================

-- 1) RPC manager_pendiente_acumulado: declarada en 20260429030000, 0 consumidores
--    en src/, 0 referencias internas en otras RPCs/triggers.
drop function if exists public.manager_pendiente_acumulado(int);

-- NOTA: La tabla `manager_costes_manuales` ESTUVO marcada como zombi pero
-- en realidad la usa el módulo Manager (queries.ts:394 useCosteManual).
-- El drop se revirtió en `20260505050000_restore_manager_costes_manuales.sql`.
-- Lección para el auditor: comprobar SIEMPRE con `grep -rn nombre src/`
-- aunque herramientas previas hayan dicho que está sin uso.
