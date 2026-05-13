import { useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Clock, LayoutGrid, ListChecks, Plus, Upload, Wallet } from 'lucide-react'
import { PageTopbar } from '@/shared/components/PageTopbar'
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
import { eurosShort } from '@/shared/lib/format'

const eur = eurosShort

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
    <div>
      <PageTopbar
        breadcrumb="OPERACIONES · COBROS"
        title="Cobros"
        subtitle="Control de deuda, vencidos y pizarra diaria."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => abrirNuevo('Pizarra')}>
              <Plus className="h-4 w-4" /> Pizarra
            </Button>
            <Button size="sm" onClick={() => abrirNuevo('Factura')}>
              <Plus className="h-4 w-4" /> Factura
            </Button>
          </>
        }
      />
      <div className="ao-page max-w-7xl py-6 md:py-8">

      {kpi && (
        <section className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
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
        </section>
      )}

      <nav className="ao-tabbar mb-5 flex w-full overflow-x-auto p-1 md:w-auto">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'ao-tab flex flex-1 items-center justify-center gap-2 whitespace-nowrap md:flex-none',
              tab === key
                ? 'font-semibold'
                : 'hover:bg-[var(--color-surface-2)]',
            )}
            data-active={tab === key}
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
    </div>
  )
}

type Tone = 'primary' | 'danger' | 'warning' | 'info' | 'muted'

const TONE_STYLE: Record<Tone, { card: string; icon: string; value: string }> = {
  primary: { card: 'border-l-[var(--mint)]', icon: 'text-[var(--mint)]', value: 'text-[var(--mint)]' },
  danger:  { card: 'border-l-[var(--coral)]', icon: 'text-[var(--coral)]', value: 'text-[var(--coral)]' },
  warning: { card: 'border-l-[var(--amber)]', icon: 'text-[var(--amber)]', value: 'text-[var(--amber)]' },
  info:    { card: 'border-l-[var(--sky)]', icon: 'text-[var(--sky)]', value: 'text-[var(--sky)]' },
  muted:   { card: 'border-l-[var(--line-2)]', icon: 'text-[var(--color-ink-3)]', value: 'text-[var(--color-ink)]' },
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
    <div className={cn('ao-card border-l-4 p-3', s.card)}>
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', s.icon)} />
        <span className="label-caps truncate">
          {label}
        </span>
      </div>
      <div className={cn('mono mt-1 text-xl font-semibold tabular-nums md:text-2xl', s.value)}>
        {value}
      </div>
      <div className="text-[11px] text-[var(--color-ink-3)]">{sub}</div>
    </div>
  )
}
