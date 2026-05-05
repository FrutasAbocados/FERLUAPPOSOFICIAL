import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { eurosShort } from '@/shared/lib/format'
import type { SerieDiariaPunto } from '../lib/types'

const eur0 = eurosShort

interface Props {
  data: SerieDiariaPunto[] | undefined
  loading: boolean
}

export function SerieDiariaChart({ data, loading }: Props) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm font-semibold text-[var(--color-ink)]">Ventas vs compras vs margen — diario</div>
        {loading && <span className="text-xs text-[var(--color-ink-3)]">cargando…</span>}
      </div>
      <div className="h-72 w-full">
        {data && data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="fecha"
                tickFormatter={(d: string) => format(parseISO(d), 'd LLL', { locale: es })}
                stroke="var(--color-ink-3)"
                fontSize={11}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(n: number) => `${(n / 1000).toFixed(0)}k`}
                stroke="var(--color-ink-3)"
                fontSize={11}
                width={48}
              />
              <Tooltip
                formatter={(v) => eur0(Number(v))}
                labelFormatter={(d) => typeof d === 'string' ? format(parseISO(d), "EEEE d 'de' LLLL", { locale: es }) : String(d)}
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ventas" name="Ventas" fill="#059669" radius={[3, 3, 0, 0]} />
              <Bar dataKey="compras" name="Compras" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              <Line dataKey="margen" name="Margen" type="monotone" stroke="#2563eb" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-3)]">
            {loading ? 'Cargando…' : 'Sin datos en este periodo'}
          </div>
        )}
      </div>
    </div>
  )
}
