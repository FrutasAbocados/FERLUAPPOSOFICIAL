import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { toast } from '@/shared/lib/toast'
import { eurosOrDash, eurosShortOrDash } from '@/shared/lib/format'
import type { Period } from '../lib/period'
import type { ClienteListItem } from '../lib/types'
import {
  useAddAlias, useAliases, useAliasPreview, useClienteFacturas,
  useClienteProductos, useDeleteAlias,
} from '../lib/queries'

const eur = eurosOrDash
const eur0 = eurosShortOrDash
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

interface Props {
  cliente: ClienteListItem
  period: Period
  onClose: () => void
}

export function ClienteDetalleModal({ cliente, period, onClose }: Props) {
  const facturas = useClienteFacturas(cliente.contact_name_canon, period)
  const productos = useClienteProductos(cliente.contact_name_canon, period)
  const aliases = useAliases()
  const addAlias = useAddAlias()
  const delAlias = useDeleteAlias()

  const [nuevoAlias, setNuevoAlias] = useState('')
  const preview = useAliasPreview(nuevoAlias)

  // ESC para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const aliasesEsteCliente = aliases.data?.filter(a => a.alias_to === cliente.contact_name_canon) ?? []

  const submitAlias = async () => {
    const from = nuevoAlias.trim()
    if (!from || from === cliente.contact_name_canon) return
    try {
      await addAlias.mutateAsync({ alias_from: from, alias_to: cliente.contact_name_canon })
      setNuevoAlias('')
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 md:p-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="ao-modal-card w-full max-w-4xl p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Cliente</p>
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)] md:text-xl">{cliente.contact_name_canon}</h2>
            <p className="mt-0.5 text-xs text-[var(--color-ink-3)]">{period.from} → {period.to}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2 border-b border-[var(--color-border)] px-5 py-4 md:grid-cols-5">
          <Tile label="Docs" value={String(cliente.docs)} />
          <Tile label="Ventas" value={eur0(cliente.ventas)} sub="con IVA" />
          <Tile label="Margen" value={eur0(cliente.margen)} sub={cliente.margen_pct == null ? '' : `${cliente.margen_pct.toFixed(1)}%`} tone="positive" />
          <Tile label="Pendiente" value={eur0(cliente.pendiente_cobro)} tone="warning" />
          <Tile label="Última" value={fmt(cliente.ultima_compra)} />
        </div>

        {/* Aliases */}
        <section className="border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">Nombres unificados (aliases)</h3>
          <p className="mt-0.5 text-xs text-[var(--color-ink-3)]">Si este cliente aparece en Holded con varios nombres, añádelos aquí para que cuenten como uno solo en todo el Manager.</p>

          {aliasesEsteCliente.length > 0 && (
            <ul className="mt-2 space-y-1">
              {aliasesEsteCliente.map(a => (
                <li key={a.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2,white)] px-3 py-1.5 text-sm">
                  <span className="truncate text-[var(--color-ink)]">{a.alias_from}</span>
                  <Button size="sm" variant="ghost" onClick={() => delAlias.mutate(a.id)} disabled={delAlias.isPending}>quitar</Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              placeholder="Nombre de Holded a unificar (escribe tal cual aparece)"
              value={nuevoAlias}
              onChange={(e) => setNuevoAlias(e.target.value)}
              className="h-9 flex-1 min-w-[260px]"
            />
            <Button size="sm" onClick={submitAlias} disabled={!nuevoAlias.trim() || addAlias.isPending}>
              {addAlias.isPending ? 'Añadiendo…' : 'Añadir alias'}
            </Button>
          </div>
          {nuevoAlias.trim().length >= 3 && (
            <div className="mt-2 rounded-md border border-[oklch(78%_.11_224_/_0.45)] bg-[oklch(93%_.06_220_/_0.75)] px-3 py-1.5 text-xs text-[oklch(39%_.11_224)] dark:bg-[oklch(30%_.08_224_/_0.42)] dark:text-[oklch(76%_.12_224)]">
              {preview.isLoading && 'Buscando…'}
              {preview.data && preview.data.docs === 0 && (
                <span>⚠️ No hay facturas con ese nombre exacto. Verifica que coincide con Holded.</span>
              )}
              {preview.data && preview.data.docs > 0 && (
                <span>
                  ✓ Si guardas, <strong>{preview.data.docs} doc(s)</strong> ({eur(preview.data.total)}) se unificarán bajo <strong>{cliente.contact_name_canon}</strong>.
                </span>
              )}
            </div>
          )}
        </section>

        <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
          {/* Productos favoritos */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Productos favoritos</h3>
            <div className="ao-data-surface rounded-lg">
              {productos.isLoading && <p className="px-3 py-2 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
              {productos.data?.length === 0 && <p className="px-3 py-2 text-sm text-[var(--color-ink-3)]">Sin productos</p>}
              <ul className="max-h-96 divide-y divide-[var(--color-border)] overflow-y-auto">
                {productos.data?.map(p => (
                  <li key={(p.product_id ?? p.nombre)} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-[var(--color-ink)]">{p.nombre}</div>
                      <div className="text-xs text-[var(--color-ink-3)]">{p.unidades.toFixed(0)} ud · {p.veces} veces</div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="text-[var(--color-ink)]">{eur(p.ventas_subtotal)}</div>
                      <div className="text-xs text-[var(--mint)]">{eur(p.margen)} {p.margen_pct == null ? '' : `(${p.margen_pct.toFixed(0)}%)`}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Facturas */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Facturas / albaranes</h3>
            <div className="ao-data-surface rounded-lg">
              {facturas.isLoading && <p className="px-3 py-2 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
              {facturas.data?.length === 0 && <p className="px-3 py-2 text-sm text-[var(--color-ink-3)]">Sin facturas</p>}
              <ul className="max-h-96 divide-y divide-[var(--color-border)] overflow-y-auto">
                {facturas.data?.map(f => (
                  <li key={f.id} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 px-3 py-2 text-sm">
                    <span className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">{f.subtipo}</span>
                    <span className="truncate text-[var(--color-ink)]">{f.doc_number ?? '—'} · {fmt(f.fecha)}</span>
                    <span className="tabular-nums text-[var(--color-ink)]">{eur(f.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: 'neutral'|'positive'|'warning' }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</div>
      <div className={`font-display text-lg font-bold ${tone === 'positive' ? 'text-[var(--mint)]' : tone === 'warning' ? 'text-[var(--color-primary)]' : 'text-[var(--color-ink)]'}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--color-ink-3)]">{sub}</div>}
    </div>
  )
}
