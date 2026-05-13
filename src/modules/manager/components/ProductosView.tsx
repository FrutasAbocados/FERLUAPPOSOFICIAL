import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CircleAlert, Search, Wand2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { eurosShort } from '@/shared/lib/format'
import type { Period } from '../lib/period'
import type { ProductoListItem } from '../lib/types'
import { useProductosLista } from '../lib/queries'
import { ProductoDetalleModal } from './ProductoDetalleModal'
import { CosteManualQuickFix } from './CosteManualQuickFix'

type SortKey = 'ventas' | 'margen' | 'unidades' | 'margen_pct'

const eur0 = eurosShort
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

interface Props {
  period: Period
}

export function ProductosView({ period }: Props) {
  const { data, isLoading } = useProductosLista(period)
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('ventas')
  const [selected, setSelected] = useState<ProductoListItem | null>(null)
  const [quickFix, setQuickFix] = useState<ProductoListItem | null>(null)
  const [soloSinCoste, setSoloSinCoste] = useState(false)

  const sinCosteCount = useMemo(
    () => (data ?? []).filter((r) => r.coste_unidad == null && r.product_id).length,
    [data],
  )

  const filtered = useMemo(() => {
    let rows = data ?? []
    const qq = q.trim().toLowerCase()
    if (qq) rows = rows.filter(r => r.nombre.toLowerCase().includes(qq))
    if (soloSinCoste) rows = rows.filter(r => r.coste_unidad == null && r.product_id)
    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'ventas':     return b.ventas - a.ventas
        case 'margen':     return b.margen - a.margen
        case 'unidades':   return b.unidades - a.unidades
        case 'margen_pct': return (b.margen_pct ?? -1) - (a.margen_pct ?? -1)
      }
    })
    return rows
  }, [data, q, sortKey, soloSinCoste])

  return (
    <div className="space-y-3">
      <div className="ao-panel flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
          <Input
            placeholder="Buscar producto…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <div className="-mx-3 flex items-center gap-1 overflow-x-auto px-3 no-scrollbar md:mx-0 md:px-0">
          <span className="shrink-0 text-xs text-[var(--color-ink-3)]">Ordenar:</span>
          {([
            { k: 'ventas',     l: 'Ventas' },
            { k: 'margen',     l: 'Margen €' },
            { k: 'unidades',   l: 'Unidades' },
            { k: 'margen_pct', l: '% margen' },
          ] as Array<{ k: SortKey; l: string }>).map(o => (
            <Button
              key={o.k}
              size="sm"
              variant={sortKey === o.k ? 'primary' : 'outline'}
              onClick={() => setSortKey(o.k)}
              className="shrink-0"
            >{o.l}</Button>
          ))}
        </div>
        {sinCosteCount > 0 && (
          <Button
            size="sm"
            variant={soloSinCoste ? 'primary' : 'outline'}
            onClick={() => setSoloSinCoste((v) => !v)}
            className="shrink-0"
            title="Filtrar productos sin coste asignado"
          >
            <CircleAlert className="mr-1 h-3.5 w-3.5" />
            {sinCosteCount} sin coste
          </Button>
        )}
        <span className="ml-auto text-xs text-[var(--color-ink-3)] tabular-nums">{filtered.length} productos</span>
      </div>

      <div className="ao-card overflow-hidden p-0">
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {!isLoading && filtered.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin productos en este periodo</p>}

        <div className="hidden md:grid md:grid-cols-[1fr_repeat(5,_120px)_80px] md:gap-2 md:border-b md:border-[var(--color-border)] md:px-4 md:py-2 md:text-xs md:font-semibold md:uppercase md:tracking-wider md:text-[var(--color-ink-3)]">
          <div>Producto</div>
          <div className="text-right">Unidades</div>
          <div className="text-right">Ventas</div>
          <div className="text-right">Margen €</div>
          <div className="text-right">% margen</div>
          <div className="text-right">Coste/ud</div>
          <div className="text-right">Última</div>
        </div>

        <ul className="divide-y divide-[var(--color-border)]">
          {filtered.map(p => (
            <li key={p.product_id ?? p.nombre}>
              <button
                onClick={() => setSelected(p)}
                className="grid w-full grid-cols-[1fr_auto] gap-2 px-4 py-2 text-left text-sm transition hover:bg-[var(--color-surface-2,#f8fafc)] md:grid-cols-[1fr_repeat(5,_120px)_80px]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[var(--color-ink)]">{p.nombre}</div>
                  {p.es_coste_manual && (
                    <div className="text-xs text-[var(--color-primary)]">coste manual</div>
                  )}
                </div>
                <div className="hidden text-right tabular-nums text-[var(--color-ink)] md:block">{p.unidades.toFixed(0)}</div>
                <div className="hidden text-right tabular-nums text-[var(--color-ink)] md:block">{eur0(p.ventas)}</div>
                <div className="hidden text-right tabular-nums text-[var(--mint)] md:block">{eur0(p.margen)}</div>
                <div className="hidden text-right tabular-nums text-[var(--color-ink-3)] md:block">{p.margen_pct == null ? '—' : `${p.margen_pct.toFixed(0)}%`}</div>
                <div className="hidden text-right tabular-nums md:block">
                  {p.coste_unidad == null ? (
                    p.product_id ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setQuickFix(p) }}
                        className="inline-flex items-center gap-1 rounded-full bg-[oklch(30%_.12_25_/_0.12)] px-2 py-0.5 text-[10px] font-semibold text-[var(--coral)] hover:bg-[oklch(30%_.12_25_/_0.18)]"
                        title="Asignar coste manual"
                      >
                        <Wand2 className="h-3 w-3" />
                        Asignar
                      </button>
                    ) : (
                      <span className="text-[var(--color-ink-3)]">—</span>
                    )
                  ) : (
                    <span className="text-[var(--color-ink-3)]">{p.coste_unidad.toFixed(2)}€</span>
                  )}
                </div>
                <div className="hidden text-right text-xs text-[var(--color-ink-3)] md:block">{fmt(p.ultima_venta)}</div>

                {/* Mobile compact */}
                <div className="text-right tabular-nums md:hidden">
                  <div className="text-[var(--color-ink)]">{eur0(p.ventas)}</div>
                  <div className="text-xs text-[var(--mint)]">{eur0(p.margen)} {p.margen_pct == null ? '' : `(${p.margen_pct.toFixed(0)}%)`}</div>
                  <div className="text-[10px] text-[var(--color-ink-3)]">{p.unidades.toFixed(0)} ud</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected && selected.product_id && (
        <ProductoDetalleModal producto={selected} period={period} onClose={() => setSelected(null)} />
      )}

      {quickFix && quickFix.product_id && (
        <CosteManualQuickFix
          productId={quickFix.product_id}
          productNombre={quickFix.nombre}
          costeActual={quickFix.coste_unidad}
          onClose={() => setQuickFix(null)}
        />
      )}
    </div>
  )
}
