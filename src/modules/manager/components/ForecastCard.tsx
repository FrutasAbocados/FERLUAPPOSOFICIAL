import { TrendingUp } from 'lucide-react'
import { useForecast } from '../lib/queries'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export function ForecastCard() {
  const { data, isLoading } = useForecast()

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-2 flex items-baseline gap-2">
        <TrendingUp className="h-4 w-4 text-[var(--color-ink-3)]" />
        <h3 className="font-display text-sm font-bold text-[var(--color-ink)]">Forecast próximo mes</h3>
        <span className="ml-auto text-xs text-[var(--color-ink-3)]">{data?.meses_usados || ''}</span>
      </div>
      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">Estimado próximo mes</div>
            <div className="font-display text-2xl font-bold text-blue-700 tabular-nums">{eur(data.forecast)}</div>
            <div className="text-xs text-[var(--color-ink-3)]">media de {data.base_meses} mes(es)</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">Mes actual proyectado</div>
            <div className="font-display text-2xl font-bold text-emerald-700 tabular-nums">{eur(data.mes_actual_proy)}</div>
            <div className="text-xs text-[var(--color-ink-3)]">{data.pct_mes.toFixed(0)}% del mes transcurrido</div>
          </div>
          <div className="col-span-2 md:col-span-1">
            <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">Vs forecast</div>
            <div className={`font-display text-2xl font-bold tabular-nums ${
              data.mes_actual_proy >= data.forecast ? 'text-emerald-700' : 'text-amber-700'
            }`}>
              {data.forecast > 0 ? `${(((data.mes_actual_proy - data.forecast) / data.forecast) * 100).toFixed(0)}%` : '—'}
            </div>
            <div className="text-xs text-[var(--color-ink-3)]">
              {data.mes_actual_proy >= data.forecast ? 'por encima del esperado' : 'por debajo del esperado'}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
