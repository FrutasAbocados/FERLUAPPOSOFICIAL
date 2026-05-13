import { useState } from 'react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { BarChart3, CalendarDays, FileText, MapPinned, Package, ReceiptText, Sparkles, TrendingUp, Users } from 'lucide-react'
import { SyncBar } from './components/SyncBar'
import { PeriodPicker } from './components/PeriodPicker'
import { ResumenView } from './components/ResumenView'
import { ClientesView } from './components/ClientesView'
import { ProductosView } from './components/ProductosView'
import { FacturasView } from './components/FacturasView'
import { AbueloView } from './components/AbueloView'
import { PatronesView } from './components/PatronesView'
import { CalendarioClientesView } from './components/CalendarioClientesView'
import { EstacionalidadCosteView } from './components/EstacionalidadCosteView'
import { MapaClientesView } from './components/MapaClientesView'
import { periodFromPreset, type Period } from './lib/period'

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
              className={tab === t.k ? 'ao-tab ao-tab-active' : 'ao-tab'}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.l}
            </button>
          ))}
        </div>

        {tab === 'resumen'    && <ResumenView   period={period} />}
        {tab === 'clientes'   && <ClientesView  period={period} />}
        {tab === 'productos'  && <ProductosView period={period} />}
        {tab === 'facturas'   && <FacturasView  period={period} />}
        {tab === 'calendario' && <CalendarioClientesView period={period} />}
        {tab === 'patrones'   && <PatronesView  period={period} />}
        {tab === 'abuelo'     && <AbueloView    period={period} />}
        {tab === 'estacionalidad' && <EstacionalidadCosteView />}
        {tab === 'mapa'       && <MapaClientesView period={period} />}
      </div>
      </div>
    </div>
  )
}
