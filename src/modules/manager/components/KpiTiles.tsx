import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { eurosShort } from '@/shared/lib/format'
import type { ResumenComparativo } from '../lib/types'

const eur = eurosShort

const pct = (n: number | null) => n == null ? '—' : `${n.toFixed(1)}%`

interface Props {
  k: ResumenComparativo | undefined
  loading: boolean
}

type Tone = 'positive' | 'negative' | 'warning' | 'neutral'

interface Tile {
  label: string
  value: string
  sub?: string
  tone: Tone
  delta?: number | null
  deltaInverso?: boolean   // para "compras" un -% es bueno; default false (= subida es buena)
}

function DeltaPill({ delta, inverso }: { delta: number | null | undefined; inverso?: boolean }) {
  if (delta == null) return null
  const positivo = inverso ? delta < 0 : delta > 0
  const neutral  = Math.abs(delta) < 0.5
  const Icon = neutral ? Minus : delta > 0 ? ArrowUp : ArrowDown
  const color = neutral ? 'text-[var(--color-ink-3)] bg-slate-100'
              : positivo ? 'text-emerald-700 bg-emerald-100'
              : 'text-red-700 bg-red-100'
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(delta).toFixed(0)}%
    </span>
  )
}

export function KpiTiles({ k, loading }: Props) {
  const tiles: Tile[] = [
    { label: 'Ventas',          value: k ? eur(k.ventas)        : '—', sub: k ? `${k.docs} docs · IVA inc.` : '',  tone: 'positive', delta: k?.ventas_delta_pct },
    { label: 'Compras',         value: k ? eur(k.compras)       : '—', sub: 'IVA inc.',                            tone: 'neutral',  delta: k?.compras_delta_pct, deltaInverso: true },
    { label: 'COGS',            value: k ? eur(k.cogs)          : '—', sub: 'coste mercancía (sin IVA)',           tone: 'neutral' },
    { label: 'Margen real',     value: k ? eur(k.margen)        : '—', sub: 'ventas − COGS (sin IVA)',             tone: k && k.margen >= 0 ? 'positive' : 'negative', delta: k?.margen_delta_pct },
    { label: 'Margen %',        value: k ? pct(k.margen_pct)    : '—', sub: 'sobre subtotal',                      tone: k && (k.margen_pct ?? 0) >= 20 ? 'positive' : 'warning' },
    { label: 'Pendiente cobro', value: k ? eur(k.pendiente_cobro) : '—', sub: 'albaranes mes',                     tone: 'warning' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {tiles.map(t => (
        <div key={t.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{t.label}</div>
            <DeltaPill delta={t.delta} inverso={t.deltaInverso} />
          </div>
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
