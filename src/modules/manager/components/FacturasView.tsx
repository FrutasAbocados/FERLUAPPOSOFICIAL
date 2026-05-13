import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, HandCoins, Search } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { eurosOrDash } from '@/shared/lib/format'
import type { Period } from '../lib/period'
import type { FacturaListItem } from '../lib/types'
import { useFacturasLista, type FacturaFiltros } from '../lib/queries'
import { FacturaDetalleModal } from './FacturaDetalleModal'
import { GenerarDeudaModal } from './GenerarDeudaModal'

const PAGE_SIZE = 100

const eur = eurosOrDash
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

const SUBTIPOS_VENTA = ['invoice', 'waybill', 'salesreceipt', 'creditnote'] as const
const SUBTIPOS_COMPRA = ['purchase', 'purchaserefund'] as const

interface Props {
  period: Period
}

export function FacturasView({ period }: Props) {
  const [tipo, setTipo] = useState<'VENTA' | 'COMPRA' | null>('VENTA')
  const [subtipo, setSubtipo] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<FacturaListItem | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [generarOpen, setGenerarOpen] = useState(false)

  // Reset página al cambiar filtros o periodo
  useEffect(() => { setPage(1); setMarcadas(new Set()) }, [tipo, subtipo, q, period.from, period.to])

  const filtros: FacturaFiltros = { tipo, subtipo, q: q.trim() || null, page, pageSize: PAGE_SIZE }
  const { data, isLoading } = useFacturasLista(period, filtros)

  const subtipos = tipo === 'COMPRA' ? SUBTIPOS_COMPRA : SUBTIPOS_VENTA
  const totalCount = data?.[0]?.total_count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const facturasMarcadas = useMemo(
    () => (data ?? []).filter(f => marcadas.has(f.id)),
    [data, marcadas]
  )
  const totalMarcado = facturasMarcadas.reduce((s, f) => s + Number(f.total ?? 0), 0)
  const allOnPage = (data ?? []).every(f => marcadas.has(f.id)) && (data ?? []).length > 0

  const cambiaTipo = (t: 'VENTA' | 'COMPRA') => {
    setTipo(t); setSubtipo(null); setMarcadas(new Set())
  }
  const toggleOne = (id: string) => {
    setMarcadas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAllOnPage = () => {
    setMarcadas(prev => {
      if (allOnPage) {
        const next = new Set(prev)
        for (const f of (data ?? [])) next.delete(f.id)
        return next
      }
      const next = new Set(prev)
      for (const f of (data ?? [])) next.add(f.id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="ao-panel space-y-2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--color-ink-3)]">Tipo:</span>
            <Button size="sm" variant={tipo === 'VENTA'  ? 'primary' : 'outline'} onClick={() => cambiaTipo('VENTA')}>Ventas</Button>
            <Button size="sm" variant={tipo === 'COMPRA' ? 'primary' : 'outline'} onClick={() => cambiaTipo('COMPRA')}>Compras</Button>
          </div>
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <Input
              placeholder="Buscar nº factura o cliente…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
          <span className="ml-auto text-xs text-[var(--color-ink-3)] tabular-nums">
            {totalCount > 0 ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalCount)} de ${totalCount}` : '0 docs'}
          </span>
        </div>
        <div className="-mx-3 flex items-center gap-1 overflow-x-auto px-3 no-scrollbar">
          <span className="shrink-0 text-xs text-[var(--color-ink-3)]">Subtipo:</span>
          <Button size="sm" variant={subtipo === null ? 'primary' : 'outline'} onClick={() => setSubtipo(null)} className="shrink-0">Todos</Button>
          {subtipos.map(s => (
            <Button
              key={s}
              size="sm"
              variant={subtipo === s ? 'primary' : 'outline'}
              onClick={() => setSubtipo(s)}
              className="shrink-0"
            >{s}</Button>
          ))}
        </div>
      </div>

      <div className="ao-card overflow-hidden p-0">
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {!isLoading && data?.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin facturas con esos filtros</p>}

        <div className="hidden md:grid md:grid-cols-[24px_80px_110px_1fr_100px_110px_110px_110px_70px] md:gap-2 md:border-b md:border-[var(--color-border)] md:px-4 md:py-2 md:text-xs md:font-semibold md:uppercase md:tracking-wider md:text-[var(--color-ink-3)]">
          <div>
            {tipo === 'VENTA' && (
              <input type="checkbox" checked={allOnPage} onChange={toggleAllOnPage} className="h-4 w-4" title="Marcar página" />
            )}
          </div>
          <div>Fecha</div>
          <div>Subtipo</div>
          <div>Cliente / Proveedor</div>
          <div>Nº doc</div>
          <div className="text-right">Subtotal</div>
          <div className="text-right">Total</div>
          <div className="text-right">Margen</div>
          <div className="text-right">%</div>
        </div>

        <ul className="divide-y divide-[var(--color-border)]">
          {data?.map(f => (
            <li key={f.id}>
              <div className="grid grid-cols-[24px_1fr_auto] items-center gap-2 px-4 py-2 text-sm transition hover:bg-[var(--color-surface-2,#f8fafc)] md:grid-cols-[24px_80px_110px_1fr_100px_110px_110px_110px_70px]">
                <div>
                  {tipo === 'VENTA' && (
                    <input
                      type="checkbox"
                      checked={marcadas.has(f.id)}
                      onChange={() => toggleOne(f.id)}
                      className="h-4 w-4"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
                <button
                  onClick={() => setSelected(f)}
                  className="contents text-left"
                >
                  {/* Mobile compact view */}
                  <div className="min-w-0 md:hidden">
                    <div className="truncate text-[var(--color-ink)]">{f.contact_name_canon ?? '(sin contacto)'}</div>
                    <div className="text-xs text-[var(--color-ink-3)]">{f.subtipo} · {f.doc_number} · {fmt(f.fecha)}</div>
                  </div>
                  <div className="text-right tabular-nums md:hidden">
                    <div className="text-[var(--color-ink)]">{eur(f.total)}</div>
                    {f.tipo === 'VENTA' && f.margen != null && (
                      <div className="text-xs text-[var(--mint)]">{eur(f.margen)} {f.margen_pct == null ? '' : `(${f.margen_pct.toFixed(0)}%)`}</div>
                    )}
                  </div>

                  {/* Desktop columns */}
                  <div className="hidden text-[var(--color-ink-3)] md:block">{fmt(f.fecha)}</div>
                  <div className="hidden text-xs text-[var(--color-ink-3)] md:block">{f.subtipo}</div>
                  <div className="hidden truncate text-[var(--color-ink)] md:block">{f.contact_name_canon ?? '(sin contacto)'}</div>
                  <div className="hidden text-[var(--color-ink-3)] md:block">{f.doc_number ?? '—'}</div>
                  <div className="hidden text-right tabular-nums text-[var(--color-ink-3)] md:block">{eur(f.subtotal)}</div>
                  <div className="hidden text-right tabular-nums font-medium text-[var(--color-ink)] md:block">{eur(f.total)}</div>
                  <div className="hidden text-right tabular-nums text-[var(--mint)] md:block">
                    {f.tipo === 'VENTA' ? eur(f.margen) : '—'}
                  </div>
                  <div className="hidden text-right tabular-nums text-[var(--color-ink-3)] md:block">
                    {f.tipo === 'VENTA' && f.margen_pct != null ? `${f.margen_pct.toFixed(0)}%` : '—'}
                  </div>
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Paginación */}
      {totalCount > PAGE_SIZE && (
        <div className="ao-panel flex items-center justify-between gap-2 px-3 py-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
          </Button>
          <span className="text-xs tabular-nums text-[var(--color-ink-3)]">
            Página {page} de {totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Siguiente <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Bottom bar selección */}
      {marcadas.size > 0 && (
        <div className="ao-card sticky bottom-2 z-30 mx-auto flex max-w-2xl items-center justify-between gap-3 border-2 border-[var(--color-primary)] px-4 py-3">
          <div className="text-sm">
            <span className="font-semibold text-[var(--color-ink)]">{marcadas.size} factura(s) seleccionada(s)</span>
            <span className="ml-2 font-medium tabular-nums text-[var(--mint)]">{eur(totalMarcado)}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMarcadas(new Set())}>Limpiar</Button>
            <Button size="sm" onClick={() => setGenerarOpen(true)}>
              <HandCoins className="mr-1 h-4 w-4" /> Generar deuda
            </Button>
          </div>
        </div>
      )}

      {selected && (
        <FacturaDetalleModal factura={selected} onClose={() => setSelected(null)} />
      )}

      {generarOpen && (
        <GenerarDeudaModal
          facturas={facturasMarcadas}
          onClose={() => setGenerarOpen(false)}
          onSuccess={() => setMarcadas(new Set())}
        />
      )}
    </div>
  )
}
