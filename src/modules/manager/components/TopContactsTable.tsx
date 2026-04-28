import type { TopContacto } from '../lib/types'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface Props {
  title: string
  rows: TopContacto[] | undefined
  loading: boolean
}

export function TopContactsTable({ title, rows, loading }: Props) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]">
        {title}
      </div>
      <ul className="divide-y divide-[var(--color-border)]">
        {loading && !rows && (
          <li className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</li>
        )}
        {rows?.length === 0 && (
          <li className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin datos en este mes</li>
        )}
        {rows?.map(r => (
          <li key={r.contact_name} className="flex items-center justify-between px-4 py-2 text-sm">
            <span className="truncate pr-3 text-[var(--color-ink)]">{r.contact_name}</span>
            <span className="flex shrink-0 items-baseline gap-3">
              <span className="text-xs text-[var(--color-ink-3)]">{r.n} fact.</span>
              <span className="font-medium tabular-nums text-[var(--color-ink)]">{eur(r.subtotal)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
