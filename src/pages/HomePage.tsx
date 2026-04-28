import { Link } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, Banknote,
  CheckSquare, CalendarDays, HandCoins, Package, TrendingUp, UserMinus, Wallet,
} from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
import { canAccess, type ModuleKey } from '@/shared/types'
import { AlertCard } from '@/modules/dashboard/components/AlertCard'
import { EstadoDelDia } from '@/modules/dashboard/components/EstadoDelDia'
import {
  useClientesInactivos, useCostesSubiendo,
  usePendienteMismatch, useProductosAnomalos,
} from '@/modules/dashboard/lib/queries'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const eur2 = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)

const MODULOS = [
  { key: 'manager',   title: 'Manager',                    to: '/manager',   Icon: BarChart3 },
  { key: 'cash',      title: 'Caja',                       to: '/cash',      Icon: Banknote },
  { key: 'tareas',    title: 'Tareas',                     to: '/tareas',    Icon: CheckSquare },
  { key: 'turnos',    title: 'Turnos',                     to: '/turnos',    Icon: CalendarDays },
  { key: 'tesoreria', title: 'Tesorería',                  to: '/tesoreria', Icon: Wallet },
  { key: 'cobros',    title: 'Control Deuda Abocados',     to: '/cobros',    Icon: HandCoins },
] as const

export function HomePage() {
  const { profile } = useAuth()
  const role = profile?.role
  const moduleEntries = MODULOS.filter(m => role && canAccess(m.key as ModuleKey, role))

  const mismatch  = usePendienteMismatch()
  const anomalos  = useProductosAnomalos(30)
  const inactivos = useClientesInactivos()
  const costes    = useCostesSubiendo(14, 15)

  // Sólo discrepancias con cobros pendiente real (Manager dice 0 ó valor distinto)
  const mismatchVisible = (mismatch.data ?? []).filter(r => r.match_status !== 'match')
  const totalMismatchEur = mismatchVisible.reduce((s, r) => s + Math.abs(r.diferencia), 0)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Hola, {profile?.display_name ?? '—'}
        </p>
        <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">
          Centro de control
        </h1>
      </header>

      <div className="space-y-4">
        <EstadoDelDia />

        <div className="grid gap-3 md:grid-cols-2">
          {/* Discrepancias Cobros vs Manager */}
          <AlertCard
            titulo="Discrepancias Cobros vs Manager"
            subtitulo="deuda Cobros vs albaranes mes en curso"
            Icon={AlertTriangle}
            severidad={mismatchVisible.length > 0 ? 'critica' : 'ok'}
            count={mismatchVisible.length}
            total={totalMismatchEur > 0 ? eur(totalMismatchEur) : undefined}
            loading={mismatch.isLoading}
            empty="Cobros y Manager cuadran"
          >
            <ul className="space-y-1.5">
              {mismatchVisible.slice(0, 6).map(r => (
                <li key={r.cliente_nombre} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
                  <span className="truncate text-[var(--color-ink)]">{r.cliente_nombre}</span>
                  <span className="text-xs tabular-nums text-[var(--color-ink-3)]">
                    Cob {eur(r.pendiente_cobros)} · Mgr {eur(r.pendiente_manager_mes)}
                  </span>
                  <span className={`text-xs tabular-nums font-medium ${r.diferencia >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                    {r.diferencia >= 0 ? '+' : ''}{eur(r.diferencia)}
                  </span>
                </li>
              ))}
              {mismatchVisible.length > 6 && (
                <li className="pt-1 text-xs text-[var(--color-ink-3)]">y {mismatchVisible.length - 6} más…</li>
              )}
            </ul>
          </AlertCard>

          {/* Productos anómalos */}
          <AlertCard
            titulo="Productos con margen anómalo"
            subtitulo="últimos 30 días"
            Icon={Package}
            severidad={(anomalos.data?.length ?? 0) > 0 ? 'aviso' : 'ok'}
            count={anomalos.data?.length ?? 0}
            loading={anomalos.isLoading}
            to="/manager"
            empty="Todos los productos con margen razonable"
          >
            <ul className="space-y-1.5">
              {anomalos.data?.slice(0, 6).map(p => (
                <li key={p.product_id ?? p.nombre} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
                  <span className="truncate text-[var(--color-ink)]">{p.nombre}</span>
                  <span className="text-xs uppercase tracking-wider text-amber-700">
                    {p.motivo === 'sin_coste' ? 'sin coste' : p.motivo === 'margen_bajo' ? 'margen bajo' : 'margen alto'}
                  </span>
                  <span className="text-xs tabular-nums text-[var(--color-ink-3)]">
                    {p.margen_pct == null ? '—' : `${p.margen_pct.toFixed(0)}%`} · {eur(p.ventas)}
                  </span>
                </li>
              ))}
              {(anomalos.data?.length ?? 0) > 6 && (
                <li className="pt-1 text-xs text-[var(--color-ink-3)]">y {(anomalos.data?.length ?? 0) - 6} más…</li>
              )}
            </ul>
          </AlertCard>

          {/* Clientes inactivos */}
          <AlertCard
            titulo="Clientes que han parado de pedir"
            subtitulo="cadencia rota vs últimos 90d"
            Icon={UserMinus}
            severidad={(inactivos.data?.length ?? 0) > 0 ? 'aviso' : 'ok'}
            count={inactivos.data?.length ?? 0}
            loading={inactivos.isLoading}
            to="/manager"
            empty="Todos los clientes activos según su patrón"
          >
            <ul className="space-y-1.5">
              {inactivos.data?.slice(0, 6).map(c => (
                <li key={c.contact_name_canon} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
                  <span className="truncate text-[var(--color-ink)]">{c.contact_name_canon}</span>
                  <span className="text-xs tabular-nums text-amber-700">
                    {c.dias_sin_pedir}d (cad. {c.cadencia_dias.toFixed(0)}d)
                  </span>
                </li>
              ))}
              {(inactivos.data?.length ?? 0) > 6 && (
                <li className="pt-1 text-xs text-[var(--color-ink-3)]">y {(inactivos.data?.length ?? 0) - 6} más…</li>
              )}
            </ul>
          </AlertCard>

          {/* Costes subiendo */}
          <AlertCard
            titulo="Costes subiendo"
            subtitulo="≥15% últimos 14d vs 90d"
            Icon={TrendingUp}
            severidad={(costes.data?.length ?? 0) > 0 ? 'aviso' : 'ok'}
            count={costes.data?.length ?? 0}
            loading={costes.isLoading}
            to="/manager"
            empty="Sin subidas relevantes"
          >
            <ul className="space-y-1.5">
              {costes.data?.slice(0, 6).map(p => (
                <li key={p.product_id} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
                  <span className="truncate text-[var(--color-ink)]">{p.nombre}</span>
                  <span className="text-xs tabular-nums text-amber-700">
                    +{p.variacion_pct.toFixed(0)}% · {eur2(p.coste_anterior)} → {eur2(p.coste_actual)}
                  </span>
                </li>
              ))}
              {(costes.data?.length ?? 0) > 6 && (
                <li className="pt-1 text-xs text-[var(--color-ink-3)]">y {(costes.data?.length ?? 0) - 6} más…</li>
              )}
            </ul>
          </AlertCard>
        </div>

        {/* Atajos de módulos */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Módulos</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {moduleEntries.map(({ key, title, to, Icon }) => (
              <Link
                key={key}
                to={to}
                className="group flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4 transition hover:border-[var(--color-primary)] hover:shadow-sm"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-[var(--color-ink)]">{title}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
