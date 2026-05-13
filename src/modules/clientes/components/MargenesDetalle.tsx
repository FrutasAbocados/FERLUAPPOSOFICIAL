import { TrendingDown, TrendingUp } from 'lucide-react'
import { euros } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { useClienteMargenDetalle } from '../lib/hooks'

type Props = { name: string; from: string; to: string }

export function MargenesDetalle({ name, from, to }: Props) {
  const { data: rows = [], isLoading } = useClienteMargenDetalle(name, from, to, 20)

  const totalMargen = rows.reduce((s, r) => s + r.margen, 0)
  const totalVentas = rows.reduce((s, r) => s + r.ventas_subtotal, 0)
  const margenMedio = totalVentas > 0 ? (totalMargen / totalVentas) * 100 : null

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Márgenes por producto <span className="text-[var(--color-ink-3)]">(top 20)</span>
        </h3>
        <div className="text-[11px] text-[var(--color-ink-3)] tabular-nums">
          {margenMedio == null ? '—' : `margen medio ${margenMedio.toFixed(1)}%`}
        </div>
      </div>
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="h-32 animate-pulse rounded bg-[var(--color-surface-2)] m-3" />
        ) : rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">
            Sin datos de margen para este cliente en el rango
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)]">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                <th className="px-3 py-1.5">Producto</th>
                <th className="px-3 py-1.5 text-right">Ventas</th>
                <th className="px-3 py-1.5 text-right">Margen €</th>
                <th className="px-3 py-1.5 text-right">Margen %</th>
                <th className="px-3 py-1.5 text-right">Δ vs media</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.product_id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-1.5 truncate text-[var(--color-ink)]">{r.nombre}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{euros(r.ventas_subtotal)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-ink)]">{euros(r.margen)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {r.margen_pct == null ? '—' : `${r.margen_pct.toFixed(0)}%`}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <DeltaBadge delta={r.delta_pp} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <tr>
                <td className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{euros(totalVentas)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--color-primary-2)]">{euros(totalMargen)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{margenMedio == null ? '—' : `${margenMedio.toFixed(1)}%`}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-[var(--color-ink-3)]">—</span>
  if (Math.abs(delta) < 0.5) {
    return <span className="text-[var(--color-ink-3)]">≈ {delta.toFixed(1)}pp</span>
  }
  const positive = delta > 0
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
      positive ? 'bg-[var(--mint-glow)] text-[var(--mint)]' : 'bg-[var(--color-danger-soft)] text-[var(--coral)]',
    )}>
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? '+' : ''}{delta.toFixed(1)}pp
    </span>
  )
}
