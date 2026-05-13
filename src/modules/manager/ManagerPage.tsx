import { useState } from 'react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { Button } from '@/shared/components/ui/button'
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
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">

      <div className="space-y-4">
        <SyncBar />
        <PeriodPicker value={period} onChange={setPeriod} />

        <div className="-mx-4 flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border)] px-4 no-scrollbar md:mx-0 md:px-0">
          {([
            { k: 'resumen',    l: 'Resumen' },
            { k: 'clientes',   l: 'Clientes' },
            { k: 'productos',  l: 'Productos' },
            { k: 'facturas',   l: 'Facturas' },
            { k: 'calendario', l: 'Calendario' },
            { k: 'patrones',   l: 'Patrones' },
            { k: 'abuelo',     l: 'Abuelo' },
            { k: 'estacionalidad', l: 'Estacionalidad coste' },
            // { k: 'mapa', l: 'Mapa' },  // oculto — geocoding poco preciso, retomar
          ] as Array<{ k: Tab; l: string }>).map(t => (
            <Button
              key={t.k}
              size="sm"
              variant={tab === t.k ? 'primary' : 'ghost'}
              onClick={() => setTab(t.k)}
              className="shrink-0"
            >{t.l}</Button>
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
