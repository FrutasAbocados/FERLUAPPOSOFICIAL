# Abocados OS — Guía para Claude

App interna de **Ferlu Project S.L.** (no SaaS). Sustituye 5 apps Netlify viejas. Producción: `https://abocadosos.vercel.app`.

## Stack
- **Frontend**: Vite + React 19 + TS + Tailwind v4 + shadcn/ui (button/card/input/label) + PWA · React Router 7 · TanStack Query v5 · Recharts
- **Backend**: Supabase (Postgres + Auth + RLS, project ref `ucjkyjhvvdofyaizzdbk`, `eu-west-1`) · Edge Functions Deno (sin `supabase-js` en edge — fetch directo a PostgREST)
- **Despliegue**: Vercel auto-deploy desde `main`. `.npmrc` con `legacy-peer-deps=true` por `vite-plugin-pwa@1.2.0`
- **Path alias**: `@/*` → `src/*`

## Roles (4 + RLS enforce)
- `admin_full` (Luis) · `admin_op` (Álvaro) · `responsable` · `empleado`
- Helpers SQL ya disponibles: `is_admin()`, `is_admin_full()`, `es_responsable()`. **Úsalos en RLS de migraciones nuevas** en lugar de copiar `exists (select 1 from profiles ...)`.

## Convenciones de código (aplicar SIEMPRE en lo que toques o añadas)

### Frontend
1. **Query keys** TanStack: `['module', 'subroute', ...params] as const`. Ejemplo: `['cash', 'mes', '2026-05']`.
2. **Cifras numéricas**: clase `tabular-nums` siempre que la cifra esté en una tabla, KPI o dashboard.
3. **Modales — click fuera cierra**: `onClick={(e) => { if (e.target === e.currentTarget) onClose() }}` en el overlay `bg-black/50`.
4. **Numeric-as-string parsing**: PostgREST devuelve `numeric` como string. Siempre `Number(val ?? 0)` antes de `.toFixed()` o suma.
5. **Modal contenedor estándar**: `fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6`. **Reusar `<Modal>` de `src/shared/components/Modal.tsx`** cuando exista (TODO).
6. **Formatter euros**: usar `euros()` / `eurosShort()` de `src/shared/lib/format.ts` (TODO promocionar). NO redefinir `new Intl.NumberFormat` localmente.
7. **`useConfirm` + `<ConfirmDialog>`**: nunca usar `window.confirm` ni `alert`. Tampoco `window.alert` — toast del shared.

### Backend (Postgres / RPCs / RLS)
1. **RPC read-only**: `language sql security invoker stable`. Sólo `security definer` cuando legítimamente necesites bypassar RLS.
2. **RPC con cambio de signature**: `drop function if exists ...; create or replace function ...`. Postgres no permite `create or replace` si cambia el `returns table`.
3. **RLS pattern triple-rol**: nombre de policy `"tabla: rol operación"`. Tres policies estándar:
   - `"tabla: admin rw"` con `is_admin()` (rw)
   - `"tabla: empleado lee propio"` con `e.user_id = auth.uid()` (select)
   - `"tabla: responsable read"` con `es_responsable()` (select)
4. **Trigger updated_at**: función `<modulo>_touch_updated()` + trigger `<modulo>_touch BEFORE UPDATE`. Patrón establecido.
5. **Migraciones**: nombres `YYYYMMDDhhmmss_descripcion.sql` (UTC). Aplicar vía MCP `mcp__supabase-ferlu__apply_migration` con el SQL en el query.

## Decisiones que NO hacer
- **Manager es la app DIOS** — proyecto PRO, sin podar. Antes de tocarlo, mapear el estado actual y validar reglas con datos reales. Ver memoria `feedback_manager_app_dios.md`.
- **Saldos calculados, no almacenados** — `Cash deuda_acum`, totales de cobros, etc. Suman en query. No materializar campos derivados (rompen al editar retroactivo).
- **Empleados sin login OK** — `empleados.user_id` puede ser NULL. NO asumir relación 1-1 con `auth.users`.
- **TOTAL con IVA en KPIs**, **subtotal sin IVA en márgenes**. Cuadra con Holded.
- **NO importar `supabase-js` en edge functions** — falla en boot. Usar `fetch` directo a `${SUPABASE_URL}/rest/v1/...` con `apikey` + `Authorization: Bearer service_role`.

## Quirks Holded sync
- `LIST` endpoint NO devuelve `line_id` en products → generar `id` por índice (`L${idx}`). PK `manager_lineas` es `(factura_id, id)`.
- Fechas Holded en zona Madrid (CEST=UTC+2 verano). Usar `Intl.DateTimeFormat` con `timeZone: 'Europe/Madrid'`, NUNCA `toISOString()`.
- `cost_price` ≠ coste real. El coste real es `subtotal/units` de las líneas COMPRA.
- Sync horario debe cubrir 60 días (no 7) — los albaranes se editan a posteriori.

## Quirks deploy
- Vercel rewrites NO soportan lookahead negativo. Patrón SPA: `{"source": "/(.*)", "destination": "/index.html"}`.
- `tsc -b` ≠ `tsc --noEmit`. Vercel usa `tsc -b`, más estricto con tipos TanStack-Query (`mutateAsync` requiere variables explícitas).
- Management API SQL endpoint NO acepta `do $$ ... $$`. Usar bloques sin `do`.

## MCPs disponibles
- `mcp__supabase-ferlu__*` — apuntando al proyecto Ferlu (Abocados OS). Usar `apply_migration` para DDL, `execute_sql` para queries y debugging.
- `mcp__github__*` — para PRs/issues/branches.
- `mcp__playwright__*` — para auditorías móviles y E2E manuales.

## Auditoría meta
- Memoria del agente: `~/.claude/agents/abocados-os-auditor.md`.
- Trigger: usuario dice "audítame" → invocar el agente.
- Output: `~/.claude/projects/-Users-luis/memory/auditor_informe_<fecha>.md`.

## Contacto operativo
- Cuenta de pruebas admin: `frutasabocados@gmail.com` / `Ferlu2025`.
- Avisar a Luis (no a Álvaro) sobre cosas digitales — Álvaro no manda en digital.
