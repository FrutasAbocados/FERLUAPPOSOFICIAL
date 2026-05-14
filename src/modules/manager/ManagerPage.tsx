import { lazy, Suspense, useState } from 'react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { BarChart3, CalendarDays, FileText, MapPinned, Package, ReceiptText, Sparkles, TrendingUp, Users } from 'lucide-react'
import { SyncBar } from './components/SyncBar'
import { PeriodPicker } from './components/PeriodPicker'
import { periodFromPreset, type Period } from './lib/period'

const ResumenView            = lazy(() => import('./components/ResumenView').then(m => ({ default: m.ResumenView })))
const ClientesView           = lazy(() => import('./components/ClientesView').then(m => ({ default: m.ClientesView })))
const ProductosView          = lazy(() => import('./components/ProductosView').then(m => ({ default: m.ProductosView })))
const FacturasView           = lazy(() => import('./components/FacturasView').then(m => ({ default: m.FacturasView })))
const AbueloView             = lazy(() => import('./components/AbueloView').then(m => ({ default: m.AbueloView })))
const PatronesView           = lazy(() => import('./components/PatronesView').then(m => ({ default: m.PatronesView })))
const CalendarioClientesView = lazy(() => import('./components/CalendarioClientesView').then(m => ({ default: m.CalendarioClientesView })))
const EstacionalidadCosteView = lazy(() => import('./components/EstacionalidadCosteView').then(m => ({ default: m.EstacionalidadCosteView })))
const MapaClientesView       = lazy(() => import('./components/MapaClientesView').then(m => ({ default: m.MapaClientesView })))

function TabFallback() {
  return (
    <div
      className="flex items-center justify-center min-h-40 text-sm"
      style={{ color: 'var(--color-muted, #6b7280)' }}
    >
      Cargando…
    </div>
  )
}

type Tab = 'resumen' | 'clientes' | 'productos' | 'facturas' | 'calendario' | 'patrones' | 'abuelo' | 'estacionalidad' | 'mapa'

export function ManagerPage() {
  const [period, setPeriod] = useState<Period>(() => periodFromPreset('mes'))
  const [tab, setTab] = useState<Tab>('resumen')

  return (
    <div>
      <PageTopbar
        breadcrumb="ANALÍTICA · MANAGER"
        title="Manager"
        subtitle="Análisis de ventas y compras en directo desde Holded · margen real con coste por línea."
      />
      <div className="ao-page py-5 md:py-7">

      <div className="space-y-4">
        <SyncBar />
        <PeriodPicker value={period} onChange={setPeriod} />

        <div className="ao-tabbar max-w-full overflow-x-auto no-scrollbar">
          {([
            { k: 'resumen',    l: 'Resumen', Icon: BarChart3 },
            { k: 'clientes',   l: 'Clientes', Icon: Users },
            { k: 'productos',  l: 'Productos', Icon: Package },
            { k: 'facturas',   l: 'Facturas', Icon: FileText },
            { k: 'calendario', l: 'Calendario', Icon: CalendarDays },
            { k: 'patrones',   l: 'Patrones', Icon: Sparkles },
            { k: 'abuelo',     l: 'Abuelo', Icon: ReceiptText },
            { k: 'estacionalidad', l: 'Estacionalidad coste', Icon: TrendingUp },
            // { k: 'mapa', l: 'Mapa' },  // oculto — geocoding poco preciso, retomar
          ] as Array<{ k: Tab; l: string; Icon: typeof MapPinned }>).map(({ Icon, ...t }) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              data-active={tab === t.k}
              className={tab === t.k ? 'ao-tab ao-tab-active' : 'ao-tab'}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.l}
            </button>
          ))}
        </div>

        <Suspense fallback={<TabFallback />}>
          {tab === 'resumen'    && <ResumenView   period={period} />}
          {tab === 'clientes'   && <ClientesView  period={period} />}
          {tab === 'productos'  && <ProductosView period={period} />}
          {tab === 'facturas'   && <FacturasView  period={period} />}
          {tab === 'calendario' && <CalendarioClientesView period={period} />}
          {tab === 'patrones'   && <PatronesView  period={period} />}
          {tab === 'abuelo'     && <AbueloView    period={period} />}
          {tab === 'estacionalidad' && <EstacionalidadCosteView />}
          {tab === 'mapa'       && <MapaClientesView period={period} />}
        </Suspense>
      </div>
      </div>
    </div>
  )
}
