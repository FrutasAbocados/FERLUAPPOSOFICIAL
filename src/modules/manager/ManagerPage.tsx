import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { SyncBar } from './components/SyncBar'
import { PeriodPicker } from './components/PeriodPicker'
import { ResumenView } from './components/ResumenView'
import { ClientesView } from './components/ClientesView'
import { ProductosView } from './components/ProductosView'
import { FacturasView } from './components/FacturasView'
import { AbueloView } from './components/AbueloView'
import { PatronesView } from './components/PatronesView'
import { periodFromPreset, type Period } from './lib/period'

type Tab = 'resumen' | 'clientes' | 'productos' | 'facturas' | 'patrones' | 'abuelo'

export function ManagerPage() {
  const [period, setPeriod] = useState<Period>(() => periodFromPreset('mes'))
  const [tab, setTab] = useState<Tab>('resumen')

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 border-b border-[var(--color-border)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Módulo</p>
        <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Manager</h1>
        <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
          Análisis de ventas y compras en directo desde Holded · margen real con coste por línea.
        </p>
      </header>

      <div className="space-y-4">
        <SyncBar />
        <PeriodPicker value={period} onChange={setPeriod} />

        <div className="flex items-center gap-1 border-b border-[var(--color-border)]">
          {([
            { k: 'resumen',   l: 'Resumen' },
            { k: 'clientes',  l: 'Clientes' },
            { k: 'productos', l: 'Productos' },
            { k: 'facturas',  l: 'Facturas' },
            { k: 'patrones',  l: 'Patrones' },
            { k: 'abuelo',    l: 'Abuelo' },
          ] as Array<{ k: Tab; l: string }>).map(t => (
            <Button
              key={t.k}
              size="sm"
              variant={tab === t.k ? 'primary' : 'ghost'}
              onClick={() => setTab(t.k)}
            >{t.l}</Button>
          ))}
        </div>

        {tab === 'resumen'   && <ResumenView   period={period} />}
        {tab === 'clientes'  && <ClientesView  period={period} />}
        {tab === 'productos' && <ProductosView period={period} />}
        {tab === 'facturas'  && <FacturasView  period={period} />}
        {tab === 'patrones'  && <PatronesView  period={period} />}
        {tab === 'abuelo'    && <AbueloView    period={period} />}
      </div>
    </div>
  )
}
