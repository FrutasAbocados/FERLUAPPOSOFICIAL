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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ao-card px-4 py-3">
            <div className="h-3 w-16 animate-pulse rounded bg-[var(--color-surface-2)]" />
            <div className="mt-2 h-6 w-20 animate-pulse rounded bg-[var(--color-surface-2)]" />
          </div>
        ))}
      </div>
      <div className="ao-card p-4">
        <div className="mb-3 h-4 w-48 animate-pulse rounded bg-[var(--color-surface-2)]" />
        <div className="flex h-64 items-end gap-1 px-2 pb-2">
          {[55, 38, 72, 45, 85, 40, 68, 52, 78, 35, 62, 48].map((h, i) => (
            <div
              key={i}
              className="flex-1 animate-pulse rounded-sm bg-[var(--color-surface-2)]"
              style={{ height: `${h}%`, animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      </div>
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
