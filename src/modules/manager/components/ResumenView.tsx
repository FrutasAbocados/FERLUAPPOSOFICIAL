import { lazy, Suspense } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import type { Period } from '../lib/period'
import { useManagerResumen } from '../lib/queries'
import { KpiTiles } from './KpiTiles'
import { TopMargenTable } from './TopMargenTable'

const ForecastCard = lazy(() => import('./ForecastCard').then(m => ({ default: m.ForecastCard })))
const SerieDiariaChart = lazy(() => import('./SerieDiariaChart').then(m => ({ default: m.SerieDiariaChart })))

function ChartFallback({ title, height }: { title: string; height: string }) {
  return (
    <div className={`ao-card p-4 ${height}`} aria-busy="true">
      <div className="mb-3 text-sm font-semibold text-[var(--color-ink)]">{title}</div>
      <div className="h-3/4 animate-pulse rounded bg-[var(--color-surface-2)]" />
    </div>
  )
}

interface Props {
  period: Period
}

export function ResumenView({ period }: Props) {
  const dashboard = useManagerResumen(period)
  const resumen = dashboard.data?.resumen

  return (
    <div className="space-y-4">
      <div className="no-print flex justify-end">
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Imprimir / PDF
        </Button>
      </div>

      <div className="print-only mb-4 border-b border-[var(--color-border)] pb-2">
        <h1 className="font-display text-2xl font-bold">Manager — Resumen {period.label}</h1>
        <p className="text-xs text-[var(--color-ink-3)]">{period.from} → {period.to} · Frutas Abocados</p>
      </div>

      {dashboard.isError && (
        <div role="alert" className="ao-card flex items-center justify-between gap-3 p-4 text-sm text-red-600 dark:text-red-400">
          <span>No se pudo cargar el resumen de Manager.</span>
          <Button size="sm" variant="outline" onClick={() => void dashboard.refetch()}>Reintentar</Button>
        </div>
      )}

      <KpiTiles k={resumen} loading={dashboard.isPending} />

      {resumen?.comp_from && (
        <p className="text-xs text-[var(--color-ink-3)]">
          Deltas comparados con periodo anterior equivalente: {resumen.comp_from} → {resumen.comp_to}
        </p>
      )}

      <Suspense fallback={<ChartFallback title="Forecast próximos meses" height="h-80" />}>
        <ForecastCard />
      </Suspense>

      <Suspense fallback={<ChartFallback title="Ventas vs compras vs margen — diario" height="h-[348px]" />}>
        <SerieDiariaChart data={dashboard.data?.serie} loading={dashboard.isPending} />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-2">
        <TopMargenTable
          title="Top 10 clientes por margen"
          subtitle="ventas sin IVA · margen € · margen %"
          loading={dashboard.isPending}
          rows={dashboard.data?.topClientes.map(r => ({
            key: r.contact_name_canon,
            nombre: r.contact_name_canon,
            docs: r.docs,
            ventas: r.ventas_subtotal,
            margen: r.margen,
            margen_pct: r.margen_pct,
          }))}
        />
        <TopMargenTable
          title="Top 10 productos por margen"
          subtitle="ventas sin IVA · margen € · margen %"
          loading={dashboard.isPending}
          rows={dashboard.data?.topProductos.map(r => ({
            key: r.product_id ?? r.nombre,
            nombre: r.nombre,
            unidades: r.unidades,
            ventas: r.ventas_subtotal,
            margen: r.margen,
            margen_pct: r.margen_pct,
          }))}
        />
      </div>
    </div>
  )
}
