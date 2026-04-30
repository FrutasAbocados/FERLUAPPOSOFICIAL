import { useState } from 'react'
import { MessageSquare, Plus, Truck, Users } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { FormularioPedido } from './components/FormularioPedido'
import { HojaRuta } from './components/HojaRuta'
import { ListaClientes } from './components/ListaClientes'
import { ListaPedidosHoy } from './components/ListaPedidosHoy'

type Tab = 'hoy' | 'nuevo' | 'ruta' | 'clientes'

export function PedidosWaPage() {
  const [tab, setTab] = useState<Tab>('hoy')

  return (
    <div className="flex h-full flex-col overflow-x-hidden">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquare className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
            <h1 className="font-display text-lg font-bold text-[var(--color-ink)] sm:text-xl">
              Pedidos WhatsApp
            </h1>
          </div>
        </div>

        <nav className="mt-3 flex gap-1 overflow-x-auto" role="tablist">
          <TabBtn active={tab === 'hoy'}   onClick={() => setTab('hoy')}>   Hoy </TabBtn>
          <TabBtn active={tab === 'nuevo'} onClick={() => setTab('nuevo')}>
            <Plus className="h-3.5 w-3.5" /> Nuevo pedido
          </TabBtn>
          <TabBtn active={tab === 'ruta'}  onClick={() => setTab('ruta')}>
            <Truck className="h-3.5 w-3.5" /> Hoja de ruta
          </TabBtn>
          <TabBtn active={tab === 'clientes'} onClick={() => setTab('clientes')}>
            <Users className="h-3.5 w-3.5" /> Clientes
          </TabBtn>
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        {tab === 'hoy'      && <ListaPedidosHoy />}
        {tab === 'nuevo'    && <FormularioPedido onCreado={() => setTab('hoy')} />}
        {tab === 'ruta'     && <HojaRuta />}
        {tab === 'clientes' && <ListaClientes />}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
          : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
      )}
    >
      {children}
    </button>
  )
}
