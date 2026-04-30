import { useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Clock, LayoutGrid, ListChecks, Plus, Upload, Wallet } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/button'
import { Dashboard } from './components/Dashboard'
import { ClientesView } from './components/ClientesView'
import { ListadoFacturas } from './components/ListadoFacturas'
import { Importador } from './components/Importador'
import { ExportPanel } from './components/ExportPanel'
import { CobrarModal } from './components/CobrarModal'
import { NuevoMovimientoModal } from './components/NuevoMovimientoModal'
import { ClienteDetalleModal } from './components/ClienteDetalleModal'
import { useMovimientos } from './lib/queries'
import { estadoMovimiento, importePendiente } from './lib/utils'
import type { TipoMovimiento } from './lib/types'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

type Tab = 'dashboard' | 'clientes' | 'facturas' | 'importar'

const TABS: { key: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
  { key: 'clientes', label: 'Clientes', Icon: LayoutGrid },
  { key: 'facturas', label: 'Facturas', Icon: ListChecks },
  { key: 'importar', label: 'Datos', Icon: Upload },
]

export function CobrosPage() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [cobrarId, setCobrarId] = useState<string | null>(null)
  const [detalleCliente, setDetalleCliente] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState<{
    open: boolean
    tipo: TipoMovimiento
    clienteId: string | null
  }>({ open: false, tipo: 'Factura', clienteId: null })

  const movs = useMovimientos()
  const kpi = useMemo(() => {
    if (!movs.data) return null
    const today = new Date().toISOString().slice(0, 10)
    const pend = movs.data.filter((m) => !m.pagado)
    const total = pend.reduce((s, m) => s + importePendiente(m), 0)
    const vencido = pend
      .filter((m) => estadoMovimiento(m) === 'Vencido')
      .reduce((s, m) => s + importePendiente(m), 0)
    const proximo = pend
      .filter((m) => estadoMovimiento(m) === 'Próximo')
      .reduce((s, m) => s + importePendiente(m), 0)
    // "Generada hoy": deuda nueva entrada con fecha_factura = today
    const generadaHoyArr = pend.filter((m) => m.fecha_factura === today)
    const generadaHoy = generadaHoyArr.reduce((s, m) => s + importePendiente(m), 0)
    return { total, vencido, proximo, generadaHoy, generadaHoyN: generadaHoyArr.length, n: pend.length }
  }, [movs.data])

  const abrirNuevo = (tipo: TipoMovimiento, clienteId: string | null = null) =>
    setNuevo({ open: true, tipo, clienteId })

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:py-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
            Frutas Abocados
          </p>
          <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">
            Control Deuda Abocados
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => abrirNuevo('Pizarra')}>
            <Plus className="h-4 w-4" /> Pizarra
          </Button>
          <Button size="sm" onClick={() => abrirNuevo('Factura')}>
            <Plus className="h-4 w-4" /> Factura
          </Button>
        </div>
      </header>

      {kpi && (
        <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
          <KpiTile
            Icon={Wallet}
            label="Deuda pendiente"
            value={eur(kpi.total)}
            sub={`${kpi.n} ${kpi.n === 1 ? 'movimiento' : 'movimientos'}`}
            tone="primary"
          />
          <KpiTile
            Icon={Plus}
            label="Generada HOY"
            value={eur(kpi.generadaHoy)}
            sub={`${kpi.generadaHoyN} ${kpi.generadaHoyN === 1 ? 'nuevo' : 'nuevos'}`}
            tone="info"
          />
          <KpiTile
            Icon={AlertTriangle}
            label="Vencido"
            value={eur(kpi.vencido)}
            sub={kpi.total > 0 ? `${Math.round((kpi.vencido / kpi.total) * 100)}% del total` : '—'}
            tone="danger"
          />
          <KpiTile
            Icon={Clock}
            label="Próximo a vencer"
            value={eur(kpi.proximo)}
            sub="≤ 7 días"
            tone="warning"
          />
        </div>
      )}

      <nav className="mb-5 flex gap-1 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-1.5 text-sm transition-colors',
              tab === key
                ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)] font-semibold'
                : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'clientes' && (
        <ClientesView
          onSelectCliente={setDetalleCliente}
          onNuevaFactura={(id) => abrirNuevo('Factura', id)}
          onNuevaPizarra={(id) => abrirNuevo('Pizarra', id)}
        />
      )}
      {tab === 'facturas' && (
        <ListadoFacturas onCobrar={setCobrarId} onVerCliente={setDetalleCliente} />
      )}
      {tab === 'importar' && (
        <div className="space-y-4">
          <Importador />
          <ExportPanel />
        </div>
      )}

      <CobrarModal movimientoId={cobrarId} onClose={() => setCobrarId(null)} />
      <NuevoMovimientoModal
        open={nuevo.open}
        tipo={nuevo.tipo}
        clienteId={nuevo.clienteId}
        onClose={() => setNuevo((s) => ({ ...s, open: false }))}
      />
      <ClienteDetalleModal
        clienteId={detalleCliente}
        onClose={() => setDetalleCliente(null)}
        onCobrar={(id) => {
          setDetalleCliente(null)
          setCobrarId(id)
        }}
      />
    </div>
  )
}

type Tone = 'primary' | 'danger' | 'warning' | 'info' | 'muted'

const TONE_STYLE: Record<Tone, { card: string; icon: string; value: string }> = {
  primary: { card: 'border-l-4 border-l-[var(--color-primary)] border-y border-r border-[var(--color-border)] bg-[var(--color-surface)]', icon: 'text-[var(--color-primary-2)]', value: 'text-[var(--color-primary-2)]' },
  danger:  { card: 'border-l-4 border-l-red-500 border-y border-r border-[var(--color-border)] bg-[var(--color-surface)]',                icon: 'text-red-600 dark:text-red-400',     value: 'text-red-700 dark:text-red-300' },
  warning: { card: 'border-l-4 border-l-amber-500 border-y border-r border-[var(--color-border)] bg-[var(--color-surface)]',              icon: 'text-amber-600 dark:text-amber-400', value: 'text-amber-700 dark:text-amber-300' },
  info:    { card: 'border-l-4 border-l-sky-500 border-y border-r border-[var(--color-border)] bg-[var(--color-surface)]',                icon: 'text-sky-600 dark:text-sky-400',     value: 'text-sky-700 dark:text-sky-300' },
  muted:   { card: 'border border-[var(--color-border)] bg-[var(--color-surface)]',                                                       icon: 'text-[var(--color-ink-3)]',          value: 'text-[var(--color-ink)]' },
}

function KpiTile({
  Icon, label, value, sub, tone,
}: {
  Icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub: string
  tone: Tone
}) {
  const s = TONE_STYLE[tone]
  return (
    <div className={cn('rounded-[var(--radius-md)] border p-3', s.card)}>
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', s.icon)} />
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          {label}
        </span>
      </div>
      <div className={cn('mt-1 font-display text-xl font-bold tabular-nums md:text-2xl', s.value)}>
        {value}
      </div>
      <div className="text-[11px] text-[var(--color-ink-3)]">{sub}</div>
    </div>
  )
}
