# Abocados OS — Guía para Claude

App interna de **Ferlu Project S.L.** (no SaaS). Sustituye 5 apps Netlify viejas.
Producción: `https://abocadosos.vercel.app`. Repo: `FrutasAbocados/FERLUAPPOSOFICIAL`.

## Contexto holding (no mezclar)
- Empresa: **Ferlu Project S.L.** (B22560510), socio Álvaro 60% / Luis 40%.
- Marca operativa: **Frutas Abocados** (mayorista frutas/verduras).
- Equipo: 5 empleados (Alex, Adrián, Germán, Raúl, Alvaro Gómez — apellido siempre, hay 2 Alvaros).
- ⚠️ **Datos Ferlu NO se mezclan con LumoTech ni Personal.** Si hace falta cross-tenant, usar broker explícito.

## Stack
- **Frontend**: Vite + React 19 + TS + Tailwind v4 + shadcn/ui (button/card/input/label) + PWA · React Router 7 · TanStack Query v5 · Recharts.
- **Backend**: Supabase (Postgres + Auth + RLS, project ref `ucjkyjhvvdofyaizzdbk`, `eu-west-1`) · Edge Functions Deno (sin `supabase-js` en edge — fetch directo a PostgREST).
- **Despliegue**: Vercel team `frutasabocados-1900s-projects` auto-deploy desde `main`. `.npmrc` con `legacy-peer-deps=true` por `vite-plugin-pwa@1.2.0`.
- **Path alias**: `@/*` → `src/*`.

## Módulos LIVE en producción (12)
1. **Dashboard** `/` — centro de alertas + Riesgo de fuga (3 motivos)
2. **Manager** `/manager` — 9 tabs analíticas + heatmap cliente×día + mapa Leaflet
3. **Agente IA** `/agente` (admin only) — chat Claude con 12 tools
4. **Caja** `/cash` — Calendario 7×N + Cierre día por repartidor
5. **Trabajadores** `/trabajadores` — 5 sub-tabs + Ruleta (default OFF)
6. **Turnos** `/turnos` — vista semanal del equipo
7. **Cobros** `/cobros` — control deuda + import Excel + filtro fechas + multi-select
8. **Sueldos socios** `/sueldos` — retiros mensuales Luis/Álvaro
9. **BBDD Trabajadores** `/bbdd-trabajadores` — sueldos+pluses
10. **Pedidos WhatsApp** `/pedidos-wa` — 8 tabs, automatización Holded completa
11. **Gastos** `/gastos` — fijos + variables + stats
12. **Clientes** `/clientes` — ficha 360° + seguimiento semanal

## Edge Functions (16)
`parser-pedido` · `parsear-factura-proveedor` · `compra-a-holded` · `pedido-a-holded` · `borrar-borrador-holded` · `holded-webhook` · `holded-sync` · `holded-sync-contactos` · `geocode-contactos` · `notif-push-send` · `notificaciones-ia` · `agent-chat` · `cobros-backup-diario` · `dashboard-briefing-diario` · `pedidos-esperados-push` · `event-dispatcher`.

## Cron jobs (7 activos via pg_cron)
Detalle en `~/.claude/projects/-Users-luis/memory/cron_jobs_ferlu.md`.

## Roles (4 + RLS enforce)
- `admin_full` (Luis + Álvaro Fersa) · `admin_op` (vacío) · `responsable` (vacío, Raúl bajó a empleado) · `empleado` (Alex, Adrián, Germán, Raúl, Alvaro Gómez por crear).
- Helpers SQL ya disponibles: `is_admin()`, `is_admin_full()`, `es_responsable()`. **Úsalos en RLS de migraciones nuevas** en lugar de copiar `exists (select 1 from profiles ...)`.

## Convenciones de código (aplicar SIEMPRE en lo que toques o añadas)

### Frontend
1. **Query keys** TanStack: `['module', 'subroute', ...params] as const`. Ej: `['cash', 'mes', '2026-05']`.
2. **Cifras numéricas**: clase `tabular-nums` siempre que la cifra esté en una tabla, KPI o dashboard.
3. **Modales — click fuera cierra**: `onClick={(e) => { if (e.target === e.currentTarget) onClose() }}` en el overlay `bg-black/50`.
4. **Numeric-as-string parsing**: PostgREST devuelve `numeric` como string. Siempre `Number(val ?? 0)` antes de `.toFixed()` o suma.
5. **Modal contenedor estándar**: `fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6`. Reusar `<Modal>` de `src/shared/components/Modal.tsx` cuando exista.
6. **Formatter euros**: usar `euros()` / `eurosShort()` de `src/shared/lib/format.ts`. NO redefinir `new Intl.NumberFormat` localmente.
7. **`useConfirm` + `<ConfirmDialog>`**: nunca `window.confirm` ni `alert`. Toast del shared.
8. **Dark mode obligatorio** — Luis usa dark por defecto. **NUNCA `bg-{color}-50` sin `dark:` o sin var CSS.** Si añades un componente, verificar que se ve en ambos modos. Regla: `feedback_dark_mode_compatible.md`.
9. **Paleta verde/warm densidad alta** — Luis rechaza Swiss editorial-blanco. NO redesigns con whitespace. Regla: `feedback_visual_density.md`.
10. **Listas editables inline por defecto** — cualquier lista de entidades nace con edición inline + acciones de mantenimiento (unir duplicados, eliminar, pausar, override). NO esperar a que Luis lo pida. Regla: `feedback_data_editable_default.md`.

### Backend (Postgres / RPCs / RLS)
1. **RPC read-only**: `language sql security invoker stable`. Sólo `security definer` cuando legítimamente necesites bypassar RLS.
2. **RPC con cambio de signature**: `drop function if exists ...; create or replace function ...`. Postgres no permite `create or replace` si cambia el `returns table`.
3. **RLS pattern triple-rol**: nombre de policy `"tabla: rol operación"`. Tres policies estándar:
   - `"tabla: admin rw"` con `is_admin()` (rw)
   - `"tabla: empleado lee propio"` con `e.user_id = auth.uid()` (select)
   - `"tabla: responsable read"` con `es_responsable()` (select)
4. **Trigger updated_at**: función `<modulo>_touch_updated()` + trigger `<modulo>_touch BEFORE UPDATE`.
5. **Migraciones**: nombres `YYYYMMDDhhmmss_descripcion.sql` (UTC). Aplicar vía MCP `mcp__supabase-ferlu__apply_migration`.
6. **Antes de DROP** tabla/RPC: regla `feedback_audit_verify_drops.md` — `grep -rn` en src/ + supabase/ + verificar filas + `perform` interno. Incidente 2026-05-05 con `manager_costes_manuales`.
7. **Quirks Postgres**: `count(*) filter` con LEFT JOIN miente · OUT params plpgsql chocan con columnas (alias todas) · Modal anidado en componente que retorna null se desmonta al invalidar query. Regla: `feedback_postgres_plpgsql_quirks.md`.

## Decisiones que NO hacer
- **Manager es la app DIOS** — proyecto PRO, sin podar. Antes de tocarlo, mapear estado actual y validar reglas con datos reales. Regla: `feedback_manager_app_dios.md`.
- **Saldos calculados, no almacenados** — Cash deuda_acum, totales cobros, etc. Suman en query. No materializar campos derivados (rompen al editar retroactivo).
- **Empleados sin login OK** — `empleados.user_id` puede ser NULL. NO asumir relación 1-1 con `auth.users`.
- **TOTAL con IVA en KPIs**, **subtotal sin IVA en márgenes**. Cuadra con Holded.
- **NO importar `supabase-js` en edge functions** — falla en boot. Usar `fetch` directo a `${SUPABASE_URL}/rest/v1/...` con `apikey` + `Authorization: Bearer service_role`.
- **Edges con imports `_shared/`**: inlinear el helper en `index.ts` antes de redeploy via MCP. Regla: `feedback_edge_no_imports_shared.md`.

## Quirks Holded sync
- `LIST` endpoint NO devuelve `line_id` en products → generar `id` por índice (`L${idx}`). PK `manager_lineas` es `(factura_id, id)`.
- Fechas Holded en zona Madrid (CEST=UTC+2 verano). Usar `Intl.DateTimeFormat` con `timeZone: 'Europe/Madrid'`, NUNCA `toISOString()`.
- `cost_price` ≠ coste real. El coste real es `subtotal/units` de las líneas COMPRA.
- Sync horario cubre 60 días (no 7) — los albaranes se editan a posteriori.
- **`documents/purchase` ignora `price` y usa `subtotal` como precio unitario** — quirk crítico verificado experimentalmente. Solo aplica a `purchase` — `invoice`/`waybill` siguen con `price`. Regla: `feedback_holded_purchase_subtotal.md`.

## Quirks deploy
- Vercel rewrites NO soportan lookahead negativo. Patrón SPA: `{"source": "/(.*)", "destination": "/index.html"}`.
- `tsc -b` ≠ `tsc --noEmit`. Vercel usa `tsc -b`, más estricto.
- Management API SQL endpoint NO acepta `do $$ ... $$`. Usar bloques sin `do`.
- **Bundle Vite >2MB** rompe `vite-plugin-pwa` build. Vercel sirve deploy anterior **sin notificación**. Fix `125b062` subió límite a 5 MiB en `vite.config.ts`. Recharts es el principal culpable si vuelve a crecer.

## MCPs disponibles
- `mcp__supabase-ferlu__*` — proyecto Ferlu. `apply_migration` para DDL, `execute_sql` para queries.
- `mcp__github__*` — PRs/issues/branches.
- `mcp__playwright__*` — auditorías móviles y E2E manuales.
- `mcp__telegram__*` — bot personal de Luis (NO mensajes para empleados desde aquí).

## Modo Dios (Plan Maestro Global, regla de oro 2026-05-09)
- **Pre-flight obligatorio** antes de tocar nada. Ver `~/.claude/SESSION_PLAYBOOK.md`.
- **Modelo por defecto**: Sonnet 4.6 (`claude-sonnet-4-6`) para implementar.
- **Haiku 4.5** (`claude-haiku-4-5-20251001`) para clasificar / parsear / decidir 1 de N.
- **Opus 4.7** (`claude-opus-4-7`) solo arquitectura crítica / decisión irreversible.
- **Prompt caching obligatorio** en system prompts >1K tokens repetidos.
- **22 reglas irrompibles** en SESSION_PLAYBOOK sec. 4.
- Tracking coste IA en `agent_interactions` cuando exista la tabla (Fase 3 Plan Maestro).

## Auditoría meta
- Skill: `abocados-os-auditor` (carpeta `~/.claude/skills/`).
- Trigger: usuario dice "audítame" / "audita" / "audit-meta" → invocar.
- Output: `~/.claude/projects/-Users-luis/memory/auditor_informe_<fecha>.md`.
- Índice histórico: `auditorias_index.md`.

## Tests E2E
- Playwright: 5 smoke tests pasan contra prod en 12s (commit `c8f21f4`).
- Comando: `pnpm test:e2e` (verificar `package.json` para comando real si dudas).
- Workflow CI `ci.yml` **PENDIENTE** que Luis cree manual desde GitHub UI (PAT sin scope `workflow`).

## Pendientes operativos abiertos (Fase 1 Plan Maestro)
- ⚠️ **Rotar API key Anthropic** (compartida en chat 2026-04-29 noche). También `VAPID_PRIVATE_KEY`.
- **Configurar webhook Holded** en producción (header `x-webhook-secret` desde `app_settings.holded_webhook_secret`, eventos `invoice.*` y `waybill.*`).
- **Vincular 8 clientes restantes** desde tab Clientes (BAR REPIPI, BERIGÚ, BLACKBERRY, CASI CASI CAFETERÍA, COLINA DEL FARO, RICHYS FOOD, VICTOR COCKTAIL, YOLE HELADERIA).
- **Vincular productos múltiple-candidato** desde tab Productos (zanahoria, manzana, kiwi, naranja, uva, hierbabuena, espinaca…).
- **Verificar borrador A261416** en Holded (DAK BURGUER, primer pedido automático real).
- **Probar push web desde iPhone** real.
- **Crear `ci.yml`** desde GitHub UI.
- **Reauth Vercel MCP** team Ferlu.
- **Apagar 5 apps Netlify viejas**.

## Para profundizar (topic-files)
- `~/.claude/projects/-Users-luis/memory/project_ferlu_app.md` — overview app
- `~/.claude/projects/-Users-luis/memory/project_ferlu_manager.md` — Manager
- `~/.claude/projects/-Users-luis/memory/project_ferlu_pedidos_automatizacion.md` — Pedidos WA
- `~/.claude/projects/-Users-luis/memory/project_ferlu_trabajadores.md` — Trabajadores
- `~/.claude/projects/-Users-luis/memory/auditoria_rls_empleado_2026-05-08.md` — RLS empleado
- `~/.claude/projects/-Users-luis/memory/cron_jobs_ferlu.md` — Cron jobs detalle
- `~/.claude/projects/-Users-luis/memory/auditorias_index.md` — Auditorías históricas
- `~/Downloads/PLAN_MAESTRO_GLOBAL.pdf` — Operativa modo dios

## Contacto operativo
- Cuenta admin testing: `frutasabocados@gmail.com` / `Ferlu2025`.
- Avisar a Luis (no a Álvaro) sobre cosas digitales — Álvaro no manda en digital.
