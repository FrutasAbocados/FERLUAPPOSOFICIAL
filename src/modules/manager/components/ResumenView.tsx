import type { Period } from '../lib/period'
import { useResumenComparativo, useSerieDiaria, useTopClientesMargen, useTopProductosMargen } from '../lib/queries'
import { ForecastCard } from './ForecastCard'
import { KpiTiles } from './KpiTiles'
import { SerieDiariaChart } from './SerieDiariaChart'
import { TopMargenTable } from './TopMargenTable'

interface Props {
  period: Period
}

export function ResumenView({ period }: Props) {
  const resumen = useResumenComparativo(period)
  const topClientes = useTopClientesMargen(period, 10)
  const topProductos = useTopProductosMargen(period, 10)
  const serie = useSerieDiaria(period)

  return (
    <div className="space-y-4">
      <KpiTiles k={resumen.data} loading={resumen.isLoading} />

      {resumen.data && resumen.data.comp_from && (
        <p className="text-xs text-[var(--color-ink-3)]">
          Deltas comparados con periodo anterior equivalente: {resumen.data.comp_from} → {resumen.data.comp_to}
        </p>
      )}

      <ForecastCard />

      <SerieDiariaChart data={serie.data} loading={serie.isLoading} />

      <div className="grid gap-4 md:grid-cols-2">
        <TopMargenTable
          title="Top 10 clientes por margen"
          subtitle="ventas · margen € · margen %"
          loading={topClientes.isLoading}
          rows={topClientes.data?.map(r => ({
            key: r.contact_name_canon,
            nombre: r.contact_name_canon,
            docs: r.docs,
            ventas: r.ventas,
            margen: r.margen,
            margen_pct: r.margen_pct,
          }))}
        />
        <TopMargenTable
          title="Top 10 productos por margen"
          subtitle="ventas · margen € · margen %"
          loading={topProductos.isLoading}
          rows={topProductos.data?.map(r => ({
            key: r.product_id ?? r.nombre,
            nombre: r.nombre,
            unidades: r.unidades,
            ventas: r.ventas,
            margen: r.margen,
            margen_pct: r.margen_pct,
          }))}
        />
      </div>
    </div>
  )
}
