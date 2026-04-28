import { useState } from 'react'
import { addMonths, format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { SyncBar } from './components/SyncBar'
import { KpiTiles } from './components/KpiTiles'
import { TopContactsTable } from './components/TopContactsTable'
import { useKpisMes, useTopContactos } from './lib/queries'

export function ManagerPage() {
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()))

  const kpis = useKpisMes(anchor)
  const topVentas = useTopContactos(anchor, 'VENTA', 10)
  const topCompras = useTopContactos(anchor, 'COMPRA', 10)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Módulo</p>
          <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Manager</h1>
          <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
            Análisis de ventas y compras en directo desde Holded.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setAnchor(a => startOfMonth(addMonths(a, -1)))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[120px] text-center text-sm font-medium capitalize">
            {format(anchor, 'LLLL yyyy', { locale: es })}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(a => startOfMonth(addMonths(a, 1)))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="space-y-5">
        <SyncBar />
        <KpiTiles k={kpis.data} loading={kpis.isLoading} />
        <div className="grid gap-4 md:grid-cols-2">
          <TopContactsTable title="Top clientes (ventas)" rows={topVentas.data} loading={topVentas.isLoading} />
          <TopContactsTable title="Top proveedores (compras)" rows={topCompras.data} loading={topCompras.isLoading} />
        </div>
      </div>
    </div>
  )
}
