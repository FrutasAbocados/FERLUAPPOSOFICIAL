import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { X } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import type { Period } from '../lib/period'
import type { ProductoListItem } from '../lib/types'
import {
  useCosteManual, useDeleteCosteManual,
  useProductoClientes, useProductoCompras, useSetCosteManual,
} from '../lib/queries'

const eur = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
const eur0 = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

interface Props {
  producto: ProductoListItem
  period: Period
  onClose: () => void
}

export function ProductoDetalleModal({ producto, period, onClose }: Props) {
  const clientes = useProductoClientes(producto.product_id, period)
  const compras = useProductoCompras(producto.product_id)
  const costeManual = useCosteManual(producto.product_id)
  const setCoste = useSetCosteManual()
  const delCoste = useDeleteCosteManual()

  const [coste, setCosteInput] = useState('')
  const [nota, setNota] = useState('')

  useEffect(() => {
    if (costeManual.data) {
      setCosteInput(String(costeManual.data.coste_eur))
      setNota(costeManual.data.nota ?? '')
    } else {
      setCosteInput('')
      setNota('')
    }
  }, [costeManual.data])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const guardarCoste = async () => {
    const v = Number(coste.replace(',', '.'))
    if (!producto.product_id || !Number.isFinite(v) || v < 0) return
    try {
      await setCoste.mutateAsync({ product_id: producto.product_id, coste_eur: v, nota: nota.trim() || null })
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : 'No se pudo guardar'}`) }
  }
  const quitarCoste = async () => {
    if (!producto.product_id) return
    try { await delCoste.mutateAsync(producto.product_id) }
    catch (e) { alert(`Error: ${e instanceof Error ? e.message : 'No se pudo quitar'}`) }
  }

  const chartData = (compras.data ?? [])
    .filter(c => c.fecha && c.precio_unit != null)
    .map(c => ({ fecha: c.fecha!, precio: Number(c.precio_unit) }))
    .reverse()

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 md:p-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-4xl rounded-2xl bg-[var(--color-surface)] shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Producto</p>
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)] md:text-xl">{producto.nombre}</h2>
            <p className="mt-0.5 text-xs text-[var(--color-ink-3)]">{period.from} → {period.to}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2 border-b border-[var(--color-border)] px-5 py-4 md:grid-cols-6">
          <Tile label="Vendido" value={`${producto.unidades.toFixed(0)} ud`} sub={`${producto.veces} líneas`} />
          <Tile label="Ventas" value={eur0(producto.ventas)} sub="con IVA" />
          <Tile label="Margen" value={eur0(producto.margen)} sub={producto.margen_pct == null ? '' : `${producto.margen_pct.toFixed(1)}%`} tone="positive" />
          <Tile label="Coste/ud" value={eur(producto.coste_unidad)} sub={producto.es_coste_manual ? 'manual' : 'media 4 últimas'} tone={producto.es_coste_manual ? 'warning' : 'neutral'} />
          <Tile label="Última compra" value={fmt(producto.ultima_compra)} />
          <Tile label="Última venta" value={fmt(producto.ultima_venta)} />
        </div>

        {/* Override coste manual */}
        <section className="border-b border-[var(--color-border)] bg-[color:rgba(245,158,11,0.06)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">
            Coste manual (override) {costeManual.data && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Activo</span>}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-ink-3)]">
            Si pones un coste aquí, sobrescribe la media de las 4 últimas compras para este producto en TODO el Manager.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Coste €/ud</label>
              <Input
                type="number" step="0.0001" min="0" placeholder="0.00"
                value={coste}
                onChange={(e) => setCosteInput(e.target.value)}
                className="h-9 w-32 tabular-nums"
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Nota (opcional)</label>
              <Input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="por qué este coste"
                className="h-9"
              />
            </div>
            <Button size="sm" onClick={guardarCoste} disabled={!coste || setCoste.isPending}>
              {setCoste.isPending ? 'Guardando…' : (costeManual.data ? 'Actualizar' : 'Guardar')}
            </Button>
            {costeManual.data && (
              <Button size="sm" variant="outline" onClick={quitarCoste} disabled={delCoste.isPending}>
                Quitar override
              </Button>
            )}
          </div>
        </section>

        <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
          {/* Top clientes que lo compran */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Clientes que lo compran</h3>
            <div className="rounded-lg border border-[var(--color-border)]">
              {clientes.isLoading && <p className="px-3 py-2 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
              {clientes.data?.length === 0 && <p className="px-3 py-2 text-sm text-[var(--color-ink-3)]">Sin compradores</p>}
              <ul className="max-h-96 divide-y divide-[var(--color-border)] overflow-y-auto">
                {clientes.data?.map(c => (
                  <li key={c.contact_name_canon} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-[var(--color-ink)]">{c.contact_name_canon}</div>
                      <div className="text-xs text-[var(--color-ink-3)]">{c.unidades.toFixed(0)} ud · {c.veces} veces</div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="text-[var(--color-ink)]">{eur(c.ventas_subtotal)}</div>
                      <div className="text-xs text-emerald-700">{eur(c.margen)} {c.margen_pct == null ? '' : `(${c.margen_pct.toFixed(0)}%)`}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Histórico precio compra */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Precio de compra histórico</h3>
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="h-48 w-full">
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="fecha" tickFormatter={(d) => format(parseISO(d), 'd LLL', { locale: es })} fontSize={10} stroke="var(--color-ink-3)" interval="preserveStartEnd" minTickGap={20} />
                      <YAxis fontSize={10} stroke="var(--color-ink-3)" width={40} tickFormatter={(n) => `${n.toFixed(2)}€`} />
                      <Tooltip
                        formatter={(v) => `${Number(v).toFixed(4)} €/ud`}
                        labelFormatter={(d) => typeof d === 'string' ? format(parseISO(d), "d 'de' LLLL yyyy", { locale: es }) : String(d)}
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                      />
                      <Line dataKey="precio" type="monotone" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-3)]">
                    {compras.isLoading ? 'Cargando…' : 'Sin compras registradas'}
                  </div>
                )}
              </div>
              {compras.data && compras.data.length > 0 && (
                <ul className="mt-2 max-h-40 divide-y divide-[var(--color-border)] overflow-y-auto text-xs">
                  {compras.data.slice(0, 20).map((c, i) => (
                    <li key={i} className="grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-2 px-1 py-1 tabular-nums">
                      <span className="text-[var(--color-ink-3)]">{fmt(c.fecha)}</span>
                      <span className="truncate text-[var(--color-ink)]">{c.contact_name}</span>
                      <span className="text-[var(--color-ink-3)]">{Number(c.units).toFixed(1)} ud</span>
                      <span className="font-medium text-[var(--color-ink)]">{Number(c.precio_unit).toFixed(3)} €</span>
                    </li>
                  ))}
                </ul>
              )}
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
      <div className={`font-display text-base font-bold ${tone === 'positive' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : 'text-[var(--color-ink)]'}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--color-ink-3)]">{sub}</div>}
    </div>
  )
}
