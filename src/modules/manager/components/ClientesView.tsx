import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Search } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import type { Period } from '../lib/period'
import type { ClienteListItem } from '../lib/types'
import { useClientesLista } from '../lib/queries'
import { ClienteDetalleModal } from './ClienteDetalleModal'

type SortKey = 'ventas' | 'margen' | 'docs' | 'pendiente'

const eur0 = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

interface Props {
  period: Period
}

export function ClientesView({ period }: Props) {
  const { data, isLoading } = useClientesLista(period)
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('ventas')
  const [selected, setSelected] = useState<ClienteListItem | null>(null)

  const filtered = useMemo(() => {
    let rows = data ?? []
    const qq = q.trim().toLowerCase()
    if (qq) rows = rows.filter(r => r.contact_name_canon.toLowerCase().includes(qq))
    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'ventas': return b.ventas - a.ventas
        case 'margen': return b.margen - a.margen
        case 'docs': return b.docs - a.docs
        case 'pendiente': return b.pendiente_cobro - a.pendiente_cobro
      }
    })
    return rows
  }, [data, q, sortKey])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
          <Input
            placeholder="Buscar cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-[var(--color-ink-3)]">Ordenar:</span>
          {([
            { k: 'ventas', l: 'Ventas' },
            { k: 'margen', l: 'Margen €' },
            { k: 'docs', l: 'Docs' },
            { k: 'pendiente', l: 'Pendiente' },
          ] as Array<{ k: SortKey; l: string }>).map(o => (
            <Button
              key={o.k}
              size="sm"
              variant={sortKey === o.k ? 'primary' : 'outline'}
              onClick={() => setSortKey(o.k)}
            >{o.l}</Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-[var(--color-ink-3)] tabular-nums">{filtered.length} clientes</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {!isLoading && filtered.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin clientes en este periodo</p>}

        <div className="hidden md:grid md:grid-cols-[1fr_repeat(5,_120px)_80px] md:gap-2 md:border-b md:border-[var(--color-border)] md:px-4 md:py-2 md:text-xs md:font-semibold md:uppercase md:tracking-wider md:text-[var(--color-ink-3)]">
          <div>Cliente</div>
          <div className="text-right">Docs</div>
          <div className="text-right">Ventas</div>
          <div className="text-right">Margen €</div>
          <div className="text-right">% margen</div>
          <div className="text-right">Pendiente</div>
          <div className="text-right">Última</div>
        </div>

        <ul className="divide-y divide-[var(--color-border)]">
          {filtered.map(c => (
            <li key={c.contact_id ?? c.contact_name_canon}>
              <button
                onClick={() => setSelected(c)}
                className="grid w-full grid-cols-[1fr_auto] gap-2 px-4 py-2 text-left text-sm transition hover:bg-[var(--color-surface-2,#f8fafc)] md:grid-cols-[1fr_repeat(5,_120px)_80px]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[var(--color-ink)]">{c.contact_name_canon}</div>
                  {c.num_aliases > 1 && (
                    <div className="text-xs text-[var(--color-ink-3)]">{c.num_aliases} nombres unificados</div>
                  )}
                </div>
                <div className="text-right text-xs text-[var(--color-ink-3)] md:text-sm md:text-[var(--color-ink)] md:tabular-nums">{c.docs}</div>
                <div className="hidden text-right tabular-nums text-[var(--color-ink)] md:block">{eur0(c.ventas)}</div>
                <div className="hidden text-right tabular-nums text-emerald-700 md:block">{eur0(c.margen)}</div>
                <div className="hidden text-right tabular-nums text-[var(--color-ink-3)] md:block">{c.margen_pct == null ? '—' : `${c.margen_pct.toFixed(0)}%`}</div>
                <div className="hidden text-right tabular-nums text-amber-700 md:block">{c.pendiente_cobro > 0 ? eur0(c.pendiente_cobro) : '—'}</div>
                <div className="hidden text-right text-xs text-[var(--color-ink-3)] md:block">{fmt(c.ultima_compra)}</div>

                {/* Mobile compact view */}
                <div className="text-right tabular-nums md:hidden">
                  <div className="text-[var(--color-ink)]">{eur0(c.ventas)}</div>
                  <div className="text-xs text-emerald-700">{eur0(c.margen)} {c.margen_pct == null ? '' : `(${c.margen_pct.toFixed(0)}%)`}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected && selected.contact_id && (
        <ClienteDetalleModal cliente={selected} period={period} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
