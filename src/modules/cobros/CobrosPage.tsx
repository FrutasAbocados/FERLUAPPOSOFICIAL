import { useState } from 'react'
import { LayoutGrid, ListChecks, Upload, BarChart3, Plus } from 'lucide-react'
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
import type { TipoMovimiento } from './lib/types'

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
