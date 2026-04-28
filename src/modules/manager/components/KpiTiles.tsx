import type { ResumenPeriodo } from '../lib/types'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const pct = (n: number | null) => n == null ? '—' : `${n.toFixed(1)}%`

interface Props {
  k: ResumenPeriodo | undefined
  loading: boolean
}

type Tone = 'positive' | 'negative' | 'warning' | 'neutral'

interface Tile {
  label: string
  value: string
  sub?: string
  tone: Tone
}

export function KpiTiles({ k, loading }: Props) {
  const tiles: Tile[] = [
    { label: 'Ventas',          value: k ? eur(k.ventas_subtotal) : '—', sub: k ? `${k.ventas_n} docs`         : '', tone: 'positive' },
    { label: 'Compras',         value: k ? eur(k.compras_subtotal) : '—', sub: k ? `${k.compras_n} facturas`   : '', tone: 'neutral' },
    { label: 'COGS',            value: k ? eur(k.cogs) : '—',             sub: 'coste mercancía vendida',           tone: 'neutral' },
    { label: 'Margen real',     value: k ? eur(k.margen_real) : '—',      sub: 'ventas − COGS',                     tone: k && k.margen_real >= 0 ? 'positive' : 'negative' },
    { label: 'Margen %',        value: k ? pct(k.margen_pct) : '—',       sub: '',                                  tone: k && (k.margen_pct ?? 0) >= 20 ? 'positive' : 'warning' },
    { label: 'Pendiente cobro', value: k ? eur(k.pendiente_cobro) : '—',  sub: '',                                  tone: 'warning' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {tiles.map(t => (
        <div key={t.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{t.label}</div>
          <div className={`mt-1 font-display text-xl font-bold lg:text-2xl ${
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
