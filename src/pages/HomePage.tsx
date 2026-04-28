import { Link } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, Banknote, CalendarClock,
  CheckSquare, CalendarDays, HandCoins, Package, TrendingUp, UserMinus,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuth } from '@/shared/auth/useAuth'
import { canAccess, type ModuleKey } from '@/shared/types'
import { AlertCard } from '@/modules/dashboard/components/AlertCard'
import { EstadoDelDia } from '@/modules/dashboard/components/EstadoDelDia'
import {
  useClientesInactivos, useCostesSubiendo,
  usePedidosEsperados, useProductosAnomalos, useTopDeudoresCobros,
  type DeudorCobros, type PedidoEsperado, type ClienteInactivo, type CosteSubiendo, type ProductoAnomalo,
} from '@/modules/dashboard/lib/queries'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

const MODULOS = [
  { key: 'manager',   title: 'Manager',                    to: '/manager',   Icon: BarChart3 },
  { key: 'cash',      title: 'Caja',                       to: '/cash',      Icon: Banknote },
  { key: 'tareas',    title: 'Tareas',                     to: '/tareas',    Icon: CheckSquare },
  { key: 'turnos',    title: 'Turnos',                     to: '/turnos',    Icon: CalendarDays },
  { key: 'cobros',    title: 'Control Deuda Abocados',     to: '/cobros',    Icon: HandCoins },
] as const

export function HomePage() {
  const { profile } = useAuth()
  const role = profile?.role
  const moduleEntries = MODULOS.filter(m => role && canAccess(m.key as ModuleKey, role))

  const deudores  = useTopDeudoresCobros()
  const esperados = usePedidosEsperados()
  const anomalos  = useProductosAnomalos(30)
  const inactivos = useClientesInactivos()
  const costes    = useCostesSubiendo(14, 15)

  const totalDeuda = (deudores.data ?? []).reduce((s, d) => s + d.pendiente, 0)
  const totalVencido = (deudores.data ?? []).reduce((s, d) => s + d.vencido, 0)
  const esperadosUrgentes = (esperados.data ?? []).filter(p => p.prioridad === 'urgente' || p.prioridad === 'pronto')

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
          {/* Top deudores Cobros */}
          <AlertCard
            titulo="Deuda pendiente Cobros"
            subtitulo={totalVencido > 0 ? `${eur(totalVencido)} vencido` : 'al día con vencimientos'}
            Icon={HandCoins}
            severidad={totalVencido > 0 ? 'critica' : (totalDeuda > 0 ? 'aviso' : 'ok')}
            count={deudores.data?.length ?? 0}
            total={totalDeuda > 0 ? eur(totalDeuda) : undefined}
            loading={deudores.isLoading}
            to="/cobros"
            empty="Sin deuda pendiente"
            preview={<DeudoresList rows={deudores.data?.slice(0, 6)} />}
            full={<DeudoresList rows={deudores.data ?? []} />}
          />

          {/* Pedidos esperados hoy/inminentes */}
          <AlertCard
            titulo="Pedidos esperados hoy / vencidos"
            subtitulo="basado en cadencia regular del cliente"
            Icon={CalendarClock}
            severidad={esperadosUrgentes.length > 0 ? 'aviso' : 'ok'}
            count={esperadosUrgentes.length}
            loading={esperados.isLoading}
            to="/manager"
            empty="Nadie por encima del patrón hoy"
            preview={<EsperadosList rows={esperadosUrgentes.slice(0, 6)} />}
            full={<EsperadosList rows={esperados.data ?? []} mostrarTodos />}
          />

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
            preview={<ProductosList rows={anomalos.data?.slice(0, 6)} />}
            full={<ProductosList rows={anomalos.data ?? []} />}
          />

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
            preview={<InactivosList rows={inactivos.data?.slice(0, 6)} />}
            full={<InactivosList rows={inactivos.data ?? []} />}
          />

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
            preview={<CostesList rows={costes.data?.slice(0, 6)} />}
            full={<CostesList rows={costes.data ?? []} />}
          />

          {/* Otra placeholder para llenar grid */}
          <AlertCard
            titulo="Atención general"
            subtitulo="actualizaciones del sistema"
            Icon={AlertTriangle}
            severidad="ok"
            count={0}
            loading={false}
            empty="Sin avisos del sistema"
          />
        </div>

        {/* Atajos */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Módulos</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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

function DeudoresList({ rows }: { rows?: DeudorCobros[] }) {
  return (
    <ul className="space-y-1.5">
      {rows?.map(d => (
        <li key={d.cliente_id} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
          <div className="min-w-0">
            <div className="truncate text-[var(--color-ink)]">{d.nombre}</div>
            <div className="text-xs text-[var(--color-ink-3)]">{d.movimientos} mov · {d.vencido > 0 ? `${eur(d.vencido)} vencido` : 'al día'}</div>
          </div>
          <span className={`text-sm font-medium tabular-nums ${d.vencido > 0 ? 'text-red-700' : 'text-amber-700'}`}>{eur(d.pendiente)}</span>
        </li>
      ))}
    </ul>
  )
}

function EsperadosList({ rows, mostrarTodos }: { rows?: PedidoEsperado[]; mostrarTodos?: boolean }) {
  const colorPrioridad = (p: PedidoEsperado['prioridad']) =>
    p === 'urgente' ? 'text-red-700' : p === 'pronto' ? 'text-amber-700' : 'text-blue-700'
  return (
    <ul className="space-y-1.5">
      {rows?.map(p => (
        <li key={p.contact_name_canon} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
          <div className="min-w-0">
            <div className="truncate text-[var(--color-ink)]">{p.contact_name_canon}</div>
            <div className="text-xs text-[var(--color-ink-3)]">cad. {p.cadencia_dias.toFixed(0)}d · ~{eur(p.ventas_medias)}</div>
          </div>
          <span className={`text-xs font-medium tabular-nums ${colorPrioridad(p.prioridad)}`}>
            {p.dias_para === 0 ? 'hoy' : p.dias_para < 0 ? `${Math.abs(p.dias_para)}d tarde` : `en ${p.dias_para}d`}
            {mostrarTodos && <span className="ml-1 text-[10px] uppercase">{p.prioridad}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ProductosList({ rows }: { rows?: ProductoAnomalo[] }) {
  return (
    <ul className="space-y-1.5">
      {rows?.map(p => (
        <li key={(p.product_id ?? p.nombre)} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
          <div className="min-w-0">
            <div className="truncate text-[var(--color-ink)]">{p.nombre}</div>
            <div className="text-xs text-amber-700">
              {p.motivo === 'sin_coste' ? 'sin coste registrado' : p.motivo === 'margen_bajo' ? 'margen bajo' : 'margen excesivo'}
            </div>
          </div>
          <span className="text-xs tabular-nums text-[var(--color-ink-3)]">
            {p.margen_pct == null ? '—' : `${p.margen_pct.toFixed(0)}%`} · {eur(p.ventas)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function InactivosList({ rows }: { rows?: ClienteInactivo[] }) {
  return (
    <ul className="space-y-1.5">
      {rows?.map(c => (
        <li key={c.contact_name_canon} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
          <div className="min-w-0">
            <div className="truncate text-[var(--color-ink)]">{c.contact_name_canon}</div>
            <div className="text-xs text-[var(--color-ink-3)]">cad. {c.cadencia_dias.toFixed(0)}d · {fmt(c.ultima_compra)}</div>
          </div>
          <span className="text-xs tabular-nums text-amber-700">{c.dias_sin_pedir}d sin pedir</span>
        </li>
      ))}
    </ul>
  )
}

function CostesList({ rows }: { rows?: CosteSubiendo[] }) {
  return (
    <ul className="space-y-1.5">
      {rows?.map(p => (
        <li key={p.product_id} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
          <div className="min-w-0">
            <div className="truncate text-[var(--color-ink)]">{p.nombre}</div>
            <div className="text-xs text-[var(--color-ink-3)]">{p.coste_anterior.toFixed(2)}€ → {p.coste_actual.toFixed(2)}€</div>
          </div>
          <span className="text-xs font-medium tabular-nums text-amber-700">+{p.variacion_pct.toFixed(0)}%</span>
        </li>
      ))}
    </ul>
  )
}
