-- ============================================================================
-- Auditoría meta 2026-05-05 · Limpieza de objetos zombi
-- ============================================================================
-- Detectados por el auditor `abocados-os-auditor` el 2026-05-05.
-- Ver informe: ~/.claude/projects/-Users-luis/memory/auditor_informe_2026-05-05.md
-- ============================================================================

-- 1) RPC manager_pendiente_acumulado: declarada en 20260429030000, 0 consumidores
--    en src/, 0 referencias internas en otras RPCs/triggers.
drop function if exists public.manager_pendiente_acumulado(int);


-- 2) Tabla manager_costes_manuales: 0 filas, 0 referencias en src/.
--    Tenía RLS policy en 20260429150000 pero nunca se llegó a usar.
drop table if exists public.manager_costes_manuales cascade;
