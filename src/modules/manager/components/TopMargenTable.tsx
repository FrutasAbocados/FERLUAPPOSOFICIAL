import { eurosShort } from '@/shared/lib/format'

interface Row {
  key: string
  nombre: string
  docs?: number
  unidades?: number
  ventas: number
  margen: number
  margen_pct: number | null
}

const eur = eurosShort

interface Props {
  title: string
  subtitle?: string
  rows: Row[] | undefined
  loading: boolean
  emptyText?: string
}

export function TopMargenTable({ title, subtitle, rows, loading, emptyText = 'Sin datos en este periodo' }: Props) {
  return (
    <div className="ao-card p-0">
      <div className="border-b border-[var(--color-border)] px-4 py-2">
        <div className="text-sm font-semibold text-[var(--color-ink)]">{title}</div>
        {subtitle && <div className="text-xs text-[var(--color-ink-3)]">{subtitle}</div>}
      </div>
      <ul className="divide-y divide-[var(--color-border)]">
        {loading && !rows && Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5">
            <span className="w-5 h-3 rounded animate-pulse bg-[var(--color-surface-2)]" />
            <span className="h-3 w-28 rounded animate-pulse bg-[var(--color-surface-2)]" />
            <span className="h-3 w-24 rounded animate-pulse bg-[var(--color-surface-2)]" />
          </li>
        ))}
        {rows?.length === 0 && (
          <li className="px-4 py-3 text-sm text-[var(--color-ink-3)]">{emptyText}</li>
        )}
        {rows?.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 px-4 py-2 text-sm">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[var(--color-ink-3)]">{i + 1}</span>
            <span className="min-w-0 truncate text-[var(--color-ink)]">{r.nombre}</span>
            <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span className="text-xs text-[var(--color-ink-3)]">{eur(r.ventas)}</span>
              <span className="font-medium text-[var(--mint)]">{eur(r.margen)}</span>
              <span className="w-12 text-right text-xs text-[var(--color-ink-3)]">
                {r.margen_pct == null ? '—' : `${r.margen_pct.toFixed(0)}%`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
