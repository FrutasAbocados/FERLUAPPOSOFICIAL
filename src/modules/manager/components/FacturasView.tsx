import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Search } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import type { Period } from '../lib/period'
import type { FacturaListItem } from '../lib/types'
import { useFacturasLista, type FacturaFiltros } from '../lib/queries'
import { FacturaDetalleModal } from './FacturaDetalleModal'

const eur = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
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
  const [selected, setSelected] = useState<FacturaListItem | null>(null)

  const filtros: FacturaFiltros = { tipo, subtipo, q: q.trim() || null }
  const { data, isLoading } = useFacturasLista(period, filtros)

  const subtipos = tipo === 'COMPRA' ? SUBTIPOS_COMPRA : SUBTIPOS_VENTA

  const cambiaTipo = (t: 'VENTA' | 'COMPRA') => {
    setTipo(t); setSubtipo(null)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
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
          <span className="ml-auto text-xs text-[var(--color-ink-3)] tabular-nums">{data?.length ?? 0} docs</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-[var(--color-ink-3)]">Subtipo:</span>
          <Button size="sm" variant={subtipo === null ? 'primary' : 'outline'} onClick={() => setSubtipo(null)}>Todos</Button>
          {subtipos.map(s => (
            <Button
              key={s}
              size="sm"
              variant={subtipo === s ? 'primary' : 'outline'}
              onClick={() => setSubtipo(s)}
            >{s}</Button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {!isLoading && data?.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin facturas con esos filtros</p>}

        <div className="hidden md:grid md:grid-cols-[80px_110px_1fr_100px_110px_110px_110px_70px] md:gap-2 md:border-b md:border-[var(--color-border)] md:px-4 md:py-2 md:text-xs md:font-semibold md:uppercase md:tracking-wider md:text-[var(--color-ink-3)]">
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
              <button
                onClick={() => setSelected(f)}
                className="grid w-full grid-cols-[1fr_auto] gap-2 px-4 py-2 text-left text-sm transition hover:bg-[var(--color-surface-2,#f8fafc)] md:grid-cols-[80px_110px_1fr_100px_110px_110px_110px_70px]"
              >
                {/* Mobile compact view */}
                <div className="min-w-0 md:hidden">
                  <div className="truncate text-[var(--color-ink)]">{f.contact_name_canon ?? '(sin contacto)'}</div>
                  <div className="text-xs text-[var(--color-ink-3)]">{f.subtipo} · {f.doc_number} · {fmt(f.fecha)}</div>
                </div>
                <div className="text-right tabular-nums md:hidden">
                  <div className="text-[var(--color-ink)]">{eur(f.total)}</div>
                  {f.tipo === 'VENTA' && f.margen != null && (
                    <div className="text-xs text-emerald-700">{eur(f.margen)} {f.margen_pct == null ? '' : `(${f.margen_pct.toFixed(0)}%)`}</div>
                  )}
                </div>

                {/* Desktop columns */}
                <div className="hidden text-[var(--color-ink-3)] md:block">{fmt(f.fecha)}</div>
                <div className="hidden text-xs text-[var(--color-ink-3)] md:block">{f.subtipo}</div>
                <div className="hidden truncate text-[var(--color-ink)] md:block">{f.contact_name_canon ?? '(sin contacto)'}</div>
                <div className="hidden text-[var(--color-ink-3)] md:block">{f.doc_number ?? '—'}</div>
                <div className="hidden text-right tabular-nums text-[var(--color-ink-3)] md:block">{eur(f.subtotal)}</div>
                <div className="hidden text-right tabular-nums font-medium text-[var(--color-ink)] md:block">{eur(f.total)}</div>
                <div className="hidden text-right tabular-nums text-emerald-700 md:block">
                  {f.tipo === 'VENTA' ? eur(f.margen) : '—'}
                </div>
                <div className="hidden text-right tabular-nums text-[var(--color-ink-3)] md:block">
                  {f.tipo === 'VENTA' && f.margen_pct != null ? `${f.margen_pct.toFixed(0)}%` : '—'}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <FacturaDetalleModal factura={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
