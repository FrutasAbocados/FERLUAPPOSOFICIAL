import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { eurosOrDash } from '@/shared/lib/format'
import type { FacturaListItem } from '../lib/types'
import { useFacturaDetalle } from '../lib/queries'

const eur = eurosOrDash
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), "EEEE d 'de' LLLL yyyy", { locale: es })

interface Props {
  factura: FacturaListItem
  onClose: () => void
}

export function FacturaDetalleModal({ factura, onClose }: Props) {
  const detalle = useFacturaDetalle(factura.id)

  const totalLineas = (detalle.data ?? []).reduce((s, l) => s + Number(l.subtotal ?? 0), 0)
  const totalCogs = (detalle.data ?? []).reduce((s, l) => s + Number(l.cogs_linea ?? 0), 0)
  const totalMargen = totalLineas - totalCogs
  const totalMargenPct = totalLineas > 0 ? (totalMargen / totalLineas) * 100 : null

  return (
    <Modal onClose={onClose} size="3xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{factura.tipo} · {factura.subtipo}</p>
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)] md:text-xl">
              {factura.doc_number ?? factura.id} · {factura.contact_name_canon ?? '(sin contacto)'}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-ink-3)]">{fmt(factura.fecha)}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {/* KPIs cabecera */}
        <div className="grid grid-cols-2 gap-2 border-b border-[var(--color-border)] px-5 py-4 md:grid-cols-5">
          <Tile label="Subtotal" value={eur(factura.subtotal)} />
          <Tile label="Total" value={eur(factura.total)} sub="con IVA" />
          {factura.tipo === 'VENTA' && (
            <>
              <Tile label="COGS" value={eur(totalCogs)} sub="suma líneas" />
              <Tile
                label="Margen"
                value={eur(totalMargen)}
                sub={totalMargenPct == null ? undefined : `${totalMargenPct.toFixed(1)}%`}
                tone={totalMargen >= 0 ? 'positive' : 'negative'}
              />
              <Tile label="Pendiente" value={eur(factura.payments_pending)} tone="warning" />
            </>
          )}
        </div>

        {/* Líneas */}
        <section className="px-5 py-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Líneas ({detalle.data?.length ?? 0})</h3>
          <div className="ao-data-surface overflow-x-auto rounded-lg">
            {detalle.isLoading && <p className="px-3 py-2 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
            {detalle.data?.length === 0 && <p className="px-3 py-2 text-sm text-[var(--color-ink-3)]">Sin líneas</p>}
            {detalle.data && detalle.data.length > 0 && (
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)] bg-[var(--panel)] text-xs uppercase tracking-wider text-[var(--color-ink-2)]">
                  <tr>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-right">Ud</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                    {factura.tipo === 'VENTA' && (
                      <>
                        <th className="px-3 py-2 text-right">Coste/ud</th>
                        <th className="px-3 py-2 text-right">Margen</th>
                        <th className="px-3 py-2 text-right">Margen %</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {detalle.data.map(l => {
                    const subtotal = Number(l.subtotal ?? 0)
                    const margen = Number(l.margen_linea ?? 0)
                    const margenPct =
                      l.margen_linea == null || subtotal <= 0 ? null : (margen / subtotal) * 100
                    return (
                    <tr key={l.id} className="bg-[var(--panel-2)]">
                      <td className="px-3 py-1.5">
                        <div className="text-[var(--color-ink)]">{l.nombre}</div>
                        {l.sku && <div className="text-xs text-[var(--color-ink-3)]">SKU {l.sku}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-ink)]">{Number(l.units ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-ink)]">{eur(l.price)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium text-[var(--color-ink)]">{eur(l.subtotal)}</td>
                      {factura.tipo === 'VENTA' && (
                        <>
                          <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-ink-2)]">{l.coste_unidad == null ? '—' : eur(l.coste_unidad)}</td>
                          <td className={`px-3 py-1.5 text-right tabular-nums ${margen >= 0 ? 'text-[var(--mint)]' : 'text-[var(--coral)]'}`}>
                            {eur(l.margen_linea)}
                          </td>
                          <td className={`px-3 py-1.5 text-right tabular-nums ${margenPct == null ? 'text-[var(--color-ink-3)]' : margen >= 0 ? 'text-[var(--mint)]' : 'text-[var(--coral)]'}`}>
                            {margenPct == null ? '—' : `${margenPct.toFixed(1)}%`}
                          </td>
                        </>
                      )}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
    </Modal>
  )
}

function Tile({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: 'neutral'|'positive'|'negative'|'warning' }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</div>
      <div className={`font-display text-base font-bold ${
        tone === 'positive' ? 'text-[var(--mint)]'
        : tone === 'negative' ? 'text-[var(--coral)]'
        : tone === 'warning' ? 'text-[var(--color-primary)]'
        : 'text-[var(--color-ink)]'
      }`}>{value}</div>
      {sub && <div className="text-xs text-[var(--color-ink-3)]">{sub}</div>}
    </div>
  )
}
