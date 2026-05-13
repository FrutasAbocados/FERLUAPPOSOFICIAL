import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { euros, eurosShort } from '@/shared/lib/format'
import { useClienteEvolucionMensual } from '../lib/hooks'

type Props = { name: string }

export function EvolucionChart({ name }: Props) {
  const { data: rows = [], isLoading } = useClienteEvolucionMensual(name, 12)

  const total = rows.reduce((s, r) => s + r.ventas, 0)
  const mediaMargenPct = rows
    .filter(r => r.margen_pct != null && r.ventas > 0)
    .reduce((acc, r, _, arr) => acc + (r.margen_pct ?? 0) / arr.length, 0)

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Evolución mensual <span className="text-[var(--color-ink-3)]">(12 meses)</span>
        </h3>
        <div className="text-[11px] text-[var(--color-ink-3)] tabular-nums">
          Total {euros(total)} · {mediaMargenPct > 0 ? `margen medio ${mediaMargenPct.toFixed(1)}%` : '—'}
        </div>
      </div>
      <div className="p-3">
        {isLoading ? (
          <div className="h-56 animate-pulse rounded bg-[var(--color-surface-2)]" />
        ) : rows.every(r => r.ventas === 0) ? (
          <div className="flex h-40 items-center justify-center text-sm text-[var(--color-ink-3)]">
            Sin actividad en los últimos 12 meses
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={rows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="mes_iso"
                tickFormatter={(d: string) => format(parseISO(d), 'LLL', { locale: es })}
                tick={{ fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(n: number) => eurosShort(n)} />
              <Tooltip
                labelFormatter={((d: any) => format(parseISO(String(d)), "MMMM yyyy", { locale: es })) as any}
                formatter={((v: any, name: any) => [euros(Number(v)), labelMap(String(name))]) as any}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="ventas" fill="var(--mint)" name="ventas" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="margen" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} name="margen" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function labelMap(k: string) {
  if (k === 'ventas') return 'Ventas'
  if (k === 'margen') return 'Margen'
  return k
}
