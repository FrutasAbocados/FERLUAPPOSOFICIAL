import { lazy, Suspense, useState } from 'react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { Coins, FileText, Package, Repeat, ShoppingCart, Truck, Users, Zap } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

const CapturaRapida = lazy(() => import('./components/CapturaRapida').then(m => ({ default: m.CapturaRapida })))
const Compra = lazy(() => import('./components/Compra').then(m => ({ default: m.Compra })))
const Compras = lazy(() => import('./components/Compras').then(m => ({ default: m.Compras })))
const MapeoCostes = lazy(() => import('./components/MapeoCostes').then(m => ({ default: m.MapeoCostes })))
const HojaRuta = lazy(() => import('./components/HojaRuta').then(m => ({ default: m.HojaRuta })))
const ListaClientes = lazy(() => import('./components/ListaClientes').then(m => ({ default: m.ListaClientes })))
const ListaPedidosHoy = lazy(() => import('./components/ListaPedidosHoy').then(m => ({ default: m.ListaPedidosHoy })))
const Productos = lazy(() => import('./components/Productos').then(m => ({ default: m.Productos })))
const Recurrentes = lazy(() => import('./components/Recurrentes').then(m => ({ default: m.Recurrentes })))

type Tab = 'captura' | 'hoy' | 'compra' | 'compras-prov' | 'mapeo-costes' | 'ruta' | 'clientes' | 'productos' | 'recurrentes'

export function PedidosWaPage() {
  const [tab, setTab] = useState<Tab>('captura')

  return (
    <div className="flex h-full flex-col overflow-x-hidden">
      <PageTopbar
        breadcrumb="OPERACIONES · PEDIDOS"
        title="Pedidos WhatsApp"
        subtitle="Automatización Holded completa · 8 tabs"
      />

      <nav className="border-b border-[var(--line)] px-4 py-3 sm:px-9" role="tablist">
        <div className="ao-tabbar max-w-full overflow-x-auto">
          <TabBtn active={tab === 'captura'} onClick={() => setTab('captura')}>
            <Zap className="h-3.5 w-3.5" /> Captura
          </TabBtn>
          <TabBtn active={tab === 'hoy'}   onClick={() => setTab('hoy')}>Hoy</TabBtn>
          <TabBtn active={tab === 'compra'} onClick={() => setTab('compra')}>
            <ShoppingCart className="h-3.5 w-3.5" /> Compra
          </TabBtn>
          <TabBtn active={tab === 'compras-prov'} onClick={() => setTab('compras-prov')}>
            <FileText className="h-3.5 w-3.5" /> Facturas prov
          </TabBtn>
          <TabBtn active={tab === 'mapeo-costes'} onClick={() => setTab('mapeo-costes')}>
            <Coins className="h-3.5 w-3.5" /> Mapeo costes
          </TabBtn>
          <TabBtn active={tab === 'ruta'}  onClick={() => setTab('ruta')}>
            <Truck className="h-3.5 w-3.5" /> Hoja de ruta
          </TabBtn>
          <TabBtn active={tab === 'clientes'} onClick={() => setTab('clientes')}>
            <Users className="h-3.5 w-3.5" /> Clientes
          </TabBtn>
          <TabBtn active={tab === 'productos'} onClick={() => setTab('productos')}>
            <Package className="h-3.5 w-3.5" /> Productos
          </TabBtn>
          <TabBtn active={tab === 'recurrentes'} onClick={() => setTab('recurrentes')}>
            <Repeat className="h-3.5 w-3.5" /> Recurrentes
          </TabBtn>
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="ao-page max-w-none">
        <Suspense fallback={<TabFallback />}>
          {tab === 'captura'      && <CapturaRapida />}
          {tab === 'hoy'          && <ListaPedidosHoy />}
          {tab === 'compra'       && <Compra />}
          {tab === 'compras-prov' && <Compras />}
          {tab === 'mapeo-costes' && <MapeoCostes />}
          {tab === 'ruta'         && <HojaRuta />}
          {tab === 'clientes'     && <ListaClientes />}
          {tab === 'productos'    && <Productos />}
          {tab === 'recurrentes'  && <Recurrentes />}
        </Suspense>
        </div>
      </div>
    </div>
  )
}

function TabFallback() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-ink-3)]">
      Cargando...
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
        'ao-tab flex shrink-0 items-center gap-1.5 whitespace-nowrap',
      )}
      data-active={active}
    >
      {children}
    </button>
  )
}
