import type { Period } from '../lib/period'
import { useResumen, useSerieDiaria, useTopClientesMargen, useTopProductosMargen } from '../lib/queries'
import { KpiTiles } from './KpiTiles'
import { SerieDiariaChart } from './SerieDiariaChart'
import { TopMargenTable } from './TopMargenTable'

interface Props {
  period: Period
}

export function ResumenView({ period }: Props) {
  const resumen = useResumen(period)
  const topClientes = useTopClientesMargen(period, 10)
  const topProductos = useTopProductosMargen(period, 10)
  const serie = useSerieDiaria(period)

  return (
    <div className="space-y-4">
      <KpiTiles k={resumen.data} loading={resumen.isLoading} />

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
