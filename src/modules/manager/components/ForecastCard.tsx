import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowDown, ArrowUp, TrendingUp } from 'lucide-react'
import { useForecast } from '../lib/queries'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const fmtMes = (d: string) => format(parseISO(d), 'LLL', { locale: es })

export function ForecastCard() {
  const { data, isLoading } = useForecast()

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <TrendingUp className="h-5 w-5 text-[var(--color-ink-3)]" />
        <h3 className="font-display text-base font-bold text-[var(--color-ink)]">Forecast próximos meses</h3>
        {data && (
          <span className={`ml-auto inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
            data.tendencia_pct >= 0 ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100'
          }`}>
            {data.tendencia_pct >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            tendencia {Math.abs(data.tendencia_pct).toFixed(1)}%/mes
          </span>
        )}
      </div>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">Mes actual proyectado</div>
              <div className="font-display text-2xl font-bold text-emerald-700 tabular-nums">{eur(data.mes_actual_proy)}</div>
              <div className="text-xs text-[var(--color-ink-3)]">{data.pct_mes.toFixed(0)}% del mes transcurrido</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">{format(parseISO(data.mes_proximo), 'LLLL', { locale: es })} (próximo)</div>
              <div className="font-display text-2xl font-bold text-blue-700 tabular-nums">{eur(data.forecast_next)}</div>
              <div className="text-xs text-[var(--color-ink-3)]">aplica tendencia capeada ±25%</div>
            </div>
            <div className="col-span-2 md:col-span-1">
              <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">Tendencia mes-a-mes</div>
              <div className={`font-display text-2xl font-bold tabular-nums ${data.tendencia_pct >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {data.tendencia_pct >= 0 ? '+' : ''}{data.tendencia_pct.toFixed(1)}%
              </div>
              <div className="text-xs text-[var(--color-ink-3)]">media últimos {data.base_meses + 1} mes(es)</div>
            </div>
          </div>

          {data.meses_serie.length > 0 && (
            <div className="mt-4 h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.meses_serie} margin={{ top: 18, right: 8, left: -10, bottom: 0 }}>
                  <XAxis dataKey="mes" tickFormatter={fmtMes} fontSize={11} stroke="var(--color-ink-3)" />
                  <YAxis tickFormatter={(n) => `${(n/1000).toFixed(0)}k`} fontSize={11} stroke="var(--color-ink-3)" width={40} />
                  <Tooltip
                    formatter={(v) => eur(Number(v))}
                    labelFormatter={(d) => typeof d === 'string' ? format(parseISO(d), "LLLL yyyy", { locale: es }) : String(d)}
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="ventas" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="ventas" position="top" formatter={(v) => `${(Number(v)/1000).toFixed(0)}k`} fontSize={10} fill="var(--color-ink-3)" />
                    {data.meses_serie.map((d, i) => (
                      <Cell key={i} fill={d.es_proy ? '#3b82f6' : '#10b981'} fillOpacity={d.es_proy ? 0.6 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-1 flex items-center justify-end gap-3 text-[10px] text-[var(--color-ink-3)]">
                <span className="flex items-center gap-1"><span className="h-2 w-2 bg-emerald-500"></span>Real</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 bg-blue-500 opacity-60"></span>Proyectado</span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
