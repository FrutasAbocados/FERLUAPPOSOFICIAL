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
    <div className="ao-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm font-semibold text-[var(--color-ink)]">Ventas vs compras vs margen — diario</div>
        {loading && <span className="text-xs text-[var(--color-ink-3)]">cargando…</span>}
      </div>
      <div className="h-72 w-full">
        {data && data.length > 0 ? (
          <ResponsiveContainer width="100%" height={288}>
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
              <Bar dataKey="ventas" name="Ventas" fill="#34d399" radius={[3, 3, 0, 0]} />
              <Bar dataKey="compras" name="Compras" fill="#64748b" radius={[3, 3, 0, 0]} />
              <Line dataKey="margen" name="Margen" type="monotone" stroke="#f0b84b" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : loading ? (
          <div className="flex h-full items-end gap-1 px-2 pb-2">
            {[55, 38, 72, 45, 85, 40, 68, 52, 78, 35, 62, 48, 80, 42, 70, 56, 88, 44].map((h, i) => (
              <div
                key={i}
                className="flex-1 animate-pulse rounded-sm bg-[var(--color-surface-2)]"
                style={{ height: `${h}%`, animationDelay: `${i * 40}ms` }}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-3)]">
            Sin datos en este periodo
          </div>
        )}
      </div>
    </div>
  )
}
