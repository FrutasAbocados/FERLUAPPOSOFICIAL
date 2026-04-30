import { Link } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, Banknote, Bot, CalendarClock,
  CheckSquare, CalendarDays, HandCoins, Package, TrendingUp, UserMinus, Users, Wallet,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuth } from '@/shared/auth/useAuth'
import { canAccess, type ModuleKey } from '@/shared/types'
import { AlertCard } from '@/modules/dashboard/components/AlertCard'
import { EstadoDelDia } from '@/modules/dashboard/components/EstadoDelDia'
import { NotificacionesPanel } from '@/modules/dashboard/components/NotificacionesPanel'
import {
  useClientesRiesgoFuga, useCostesSubiendo,
  usePedidosEsperados, useProductosAnomalos, useTopDeudoresCobros,
  type DeudorCobros, type PedidoEsperado, type ClienteRiesgoFuga, type CosteSubiendo, type ProductoAnomalo,
} from '@/modules/dashboard/lib/queries'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

const MODULOS = [
  { key: 'manager',   title: 'Manager',                    to: '/manager',   Icon: BarChart3 },
  { key: 'agente',    title: 'Agente IA',                  to: '/agente',    Icon: Bot },
  { key: 'cash',      title: 'Caja',                       to: '/cash',      Icon: Banknote },
  { key: 'trabajadores', title: 'Trabajadores',            to: '/trabajadores', Icon: CheckSquare },
  { key: 'turnos',    title: 'Turnos',                     to: '/turnos',    Icon: CalendarDays },
  { key: 'cobros',    title: 'Control Deuda Abocados',     to: '/cobros',    Icon: HandCoins },
  { key: 'sueldos',   title: 'Sueldos socios',             to: '/sueldos',   Icon: Wallet },
  { key: 'bbdd_trabajadores', title: 'BBDD Trabajadores',  to: '/bbdd-trabajadores', Icon: Users },
] as const

export function HomePage() {
  const { profile } = useAuth()
  const role = profile?.role

  if (role === 'empleado') return <HomeEmpleado />

  return <HomeAdmin />
}

function HomeAdmin() {
  const { profile } = useAuth()
  const role = profile?.role
  const moduleEntries = MODULOS.filter(m => role && canAccess(m.key as ModuleKey, role))

  const deudores  = useTopDeudoresCobros()
  const esperados = usePedidosEsperados()
  const anomalos  = useProductosAnomalos(30)
  const riesgoFuga = useClientesRiesgoFuga()
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
        <NotificacionesPanel />
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

          {/* Riesgo de fuga (inactivo / ralentiza / ticket cae) */}
          <AlertCard
            titulo="Riesgo de fuga"
            subtitulo="parados, ralentizan o ticket cae"
            Icon={UserMinus}
            severidad={
              (riesgoFuga.data ?? []).some(c => c.severidad === 'critica')
                ? 'critica'
                : (riesgoFuga.data?.length ?? 0) > 0 ? 'aviso' : 'ok'
            }
            count={riesgoFuga.data?.length ?? 0}
            loading={riesgoFuga.isLoading}
            to="/manager"
            empty="Sin clientes en riesgo"
            preview={<RiesgoFugaList rows={riesgoFuga.data?.slice(0, 6)} />}
            full={<RiesgoFugaList rows={riesgoFuga.data ?? []} />}
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

function HomeEmpleado() {
  const { profile } = useAuth()
  const role = profile?.role
  const moduleEntries = MODULOS.filter(m => role && canAccess(m.key as ModuleKey, role))

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Hola, {profile?.display_name ?? '—'}
        </p>
        <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">
          Tu panel
        </h1>
      </header>

      <div className="space-y-4">
        <NotificacionesPanel />

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Tus módulos</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

const MOTIVO_LABEL: Record<'inactivo' | 'ralentiza' | 'ticket_cae', string> = {
  inactivo:   'parado',
  ralentiza:  'ralentiza',
  ticket_cae: 'ticket cae',
}

function MotivoChip({ motivo }: { motivo: 'inactivo' | 'ralentiza' | 'ticket_cae' }) {
  const cls =
    motivo === 'inactivo'
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-800'
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {MOTIVO_LABEL[motivo]}
    </span>
  )
}

function RiesgoFugaList({ rows }: { rows?: ClienteRiesgoFuga[] }) {
  return (
    <ul className="space-y-1.5">
      {rows?.map(c => {
        const dropPct =
          c.ticket_medio_30d != null && c.ticket_medio_30_90 && c.ticket_medio_30_90 > 0
            ? Math.round((1 - c.ticket_medio_30d / c.ticket_medio_30_90) * 100)
            : null
        const showTicket = c.motivos.includes('ticket_cae') && dropPct != null
        return (
          <li key={c.contact_name_canon} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[var(--color-ink)]">
                <span className="truncate">{c.contact_name_canon}</span>
                <span className="flex shrink-0 gap-1">
                  {c.motivos.map(m => <MotivoChip key={m} motivo={m} />)}
                </span>
              </div>
              <div className="text-xs text-[var(--color-ink-3)]">
                cad. {c.cadencia_dias.toFixed(0)}d · {fmt(c.ultima_compra)}
                {showTicket ? ` · ticket ${c.ticket_medio_30_90?.toFixed(0)}€→${c.ticket_medio_30d?.toFixed(0)}€` : ''}
              </div>
            </div>
            <span className={`text-xs tabular-nums ${c.severidad === 'critica' ? 'text-red-700' : 'text-amber-700'}`}>
              {c.motivos.includes('inactivo') || c.motivos.includes('ralentiza')
                ? `${c.dias_sin_pedir}d sin pedir`
                : showTicket ? `-${dropPct}%` : ''}
            </span>
          </li>
        )
      })}
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
