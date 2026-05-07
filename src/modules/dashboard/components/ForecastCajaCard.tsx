import { useMemo } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { TrendingUp } from 'lucide-react'
import { eurosShort } from '@/shared/lib/format'
import { useForecastCaja } from '../lib/queries'

const eur0 = eurosShort

export function ForecastCajaCard() {
  const { data, isLoading } = useForecastCaja(30)

  const chartData = useMemo(() => {
    return (data ?? []).map((d) => ({
      ...d,
      label: format(parseISO(d.fecha), 'd LLL', { locale: es }),
    }))
  }, [data])

  const totales = useMemo(() => {
    const arr = data ?? []
    const entradas = arr.reduce((s, d) => s + d.entradas, 0)
    const salidas = arr.reduce((s, d) => s + d.salidas, 0)
    return {
      entradas,
      salidas,
      neto: entradas - salidas,
      cobros: arr.reduce((s, d) => s + d.num_cobros, 0),
      gastos: arr.reduce((s, d) => s + d.num_gastos, 0),
    }
  }, [data])

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:p-5">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[var(--color-primary-2)]" />
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
            Forecast de caja · próximos 30 días
          </h2>
        </div>
        <span className="text-xs text-[var(--color-ink-3)]">
          Cobros esperados − gastos fijos programados
        </span>
      </header>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Entradas" value={eur0(totales.entradas)} hint={`${totales.cobros} facturas`} tone="positive" />
        <Stat label="Salidas" value={eur0(totales.salidas)} hint={`${totales.gastos} gastos`} tone="negative" />
        <Stat
          label="Neto 30d"
          value={eur0(totales.neto)}
          hint={totales.neto >= 0 ? 'flujo positivo' : 'flujo negativo'}
          tone={totales.neto >= 0 ? 'positive' : 'negative'}
        />
      </div>

      <div className="h-[260px] w-full">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-3)]">Cargando…</div>
        ) : (
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => eur0(Number(v))} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => eur0(Number(v))} />
              <Tooltip content={<ForecastTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="entradas" name="Entradas" fill="#15803d" opacity={0.85} />
              <Bar yAxisId="left" dataKey="salidas" name="Salidas" fill="#dc2626" opacity={0.85} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="neto_acumulado"
                name="Neto acumulado"
                stroke="#0369a1"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="mt-2 text-[11px] text-[var(--color-ink-3)]">
        Entradas = facturas con cobro pendiente proyectadas a su fecha de vencimiento (vencidas se proyectan a hoy).
        Salidas = gastos fijos activos por <code>dia_cargo</code> aún no marcados como pagados.
      </p>
    </section>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'positive' | 'negative' }) {
  const valColor = tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-rose-700' : 'text-[var(--color-ink)]'
  return (
    <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">{label}</div>
      <div className={`font-display text-lg font-bold tabular-nums ${valColor}`}>{value}</div>
      {hint && <div className="text-[10px] text-[var(--color-ink-3)]">{hint}</div>}
    </div>
  )
}

interface TooltipPayloadEntry {
  name?: string
  value?: number
  color?: string
}

function ForecastTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs shadow">
      <div className="font-semibold text-[var(--color-ink)]">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 tabular-nums">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[var(--color-ink-2)]">{p.name}:</span>
          <span className="font-semibold text-[var(--color-ink)]">{eur0(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  )
}
