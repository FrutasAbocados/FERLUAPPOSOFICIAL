import type { KpiMes } from '../lib/types'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface Props {
  k: KpiMes | undefined
  loading: boolean
}

export function KpiTiles({ k, loading }: Props) {
  const tiles = [
    { label: 'Ventas (subtotal)', value: k ? eur(k.ventas_subtotal) : '—', sub: k ? `${k.ventas_n} facturas` : '', tone: 'positive' as const },
    { label: 'Compras (subtotal)', value: k ? eur(k.compras_subtotal) : '—', sub: k ? `${k.compras_n} facturas` : '', tone: 'neutral' as const },
    { label: 'Margen bruto', value: k ? eur(k.margen) : '—', sub: k && k.ventas_subtotal > 0 ? `${((k.margen / k.ventas_subtotal) * 100).toFixed(1)}%` : '', tone: k && k.margen >= 0 ? 'positive' : 'negative' as const },
    { label: 'Pendiente cobro', value: k ? eur(k.ventas_pendiente) : '—', sub: '', tone: 'warning' as const },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map(t => (
        <div key={t.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{t.label}</div>
          <div className={`mt-1 font-display text-2xl font-bold ${
            t.tone === 'positive' ? 'text-emerald-700'
            : t.tone === 'negative' ? 'text-red-700'
            : t.tone === 'warning'  ? 'text-amber-700'
            : 'text-[var(--color-ink)]'
          }`}>
            {loading && !k ? '…' : t.value}
          </div>
          {t.sub && <div className="mt-0.5 text-xs text-[var(--color-ink-3)]">{t.sub}</div>}
        </div>
      ))}
    </div>
  )
}
