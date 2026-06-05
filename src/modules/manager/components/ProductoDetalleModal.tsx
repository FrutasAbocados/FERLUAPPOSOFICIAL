import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { TrendingDown, X } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { toast } from '@/shared/lib/toast'
import { eurosOrDash, eurosShortOrDash } from '@/shared/lib/format'
import type { Period } from '../lib/period'
import type { ProductoListItem } from '../lib/types'
import {
  useCosteManual, useDeleteCosteManual,
  useProductoClientes, useProductoCompras, useProductoHistorico, useSetCosteManual,
  useCosteManualNombre, useDeleteCosteManualNombre,
  useProductoClientesNombre, useProductoComprasNombre, useProductoHistoricoNombre,
  useSetCosteManualNombre,
} from '../lib/queries'

const eur = eurosOrDash
const eur0 = eurosShortOrDash
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

interface Props {
  producto: ProductoListItem
  period: Period
  onClose: () => void
}

export function ProductoDetalleModal({ producto, period, onClose }: Props) {
  // Productos de facturas PDF de proveedor no tienen product_id → todo va por nombre.
  const pid = producto.product_id
  const byName = !pid
  const nombre = producto.nombre

  const clientesId = useProductoClientes(pid, period)
  const clientesNm = useProductoClientesNombre(byName ? nombre : null, period)
  const clientes = byName ? clientesNm : clientesId

  const comprasId = useProductoCompras(pid)
  const comprasNm = useProductoComprasNombre(byName ? nombre : null)
  const compras = byName ? comprasNm : comprasId

  const historicoId = useProductoHistorico(pid, 12)
  const historicoNm = useProductoHistoricoNombre(byName ? nombre : null, 12)
  const historico = byName ? historicoNm : historicoId

  const costeManual = useCosteManual(pid)
  const costeManualNm = useCosteManualNombre(byName ? nombre : null)
  const setCoste = useSetCosteManual()
  const delCoste = useDeleteCosteManual()
  const setCosteNm = useSetCosteManualNombre()
  const delCosteNm = useDeleteCosteManualNombre()

  const today = format(new Date(), 'yyyy-MM-dd')
  const [costeDraft, setCosteDraft] = useState({ coste: '', nota: '', fecha_desde: today })

  const guardarCoste = async () => {
    const v = Number(costeDraft.coste.replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) return
    try {
      if (byName) {
        await setCosteNm.mutateAsync({ nombre, coste_eur: v, nota: costeDraft.nota.trim() || null })
      } else {
        if (!costeDraft.fecha_desde) return
        await setCoste.mutateAsync({
          product_id:  pid!,
          fecha_desde: costeDraft.fecha_desde,
          coste_eur:   v,
          nota:        costeDraft.nota.trim() || null,
        })
      }
      setCosteDraft({ coste: '', nota: '', fecha_desde: today })
    } catch (e) { toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' }) }
  }
  const quitarCoste = async (fecha_desde: string) => {
    if (!pid) return
    try { await delCoste.mutateAsync({ product_id: pid, fecha_desde }) }
    catch (e) { toast({ title: 'No se pudo quitar', description: e instanceof Error ? e.message : '', variant: 'error' }) }
  }
  const quitarCosteNombre = async () => {
    try { await delCosteNm.mutateAsync({ nombre }) }
    catch (e) { toast({ title: 'No se pudo quitar', description: e instanceof Error ? e.message : '', variant: 'error' }) }
  }
  const guardandoCoste = setCoste.isPending || setCosteNm.isPending

  const chartData = (compras.data ?? [])
    .filter(c => c.fecha && c.precio_unit != null)
    .map(c => ({ fecha: c.fecha!, precio: Number(c.precio_unit) }))
    .reverse()

  // Análisis estacionalidad / oportunidad de compra
  const analisis = useMemo(() => {
    const meses = (historico.data ?? []).filter(m => m.precio_compra_medio != null && m.precio_compra_medio! > 0)
    if (meses.length < 2) return null
    const precios = meses.map(m => m.precio_compra_medio!)
    const mediaHist = precios.reduce((s, p) => s + p, 0) / precios.length
    const ultimoMes = meses[meses.length - 1]
    const ultimoPrecio = ultimoMes.precio_compra_medio!
    const desviacionPct = ((ultimoPrecio - mediaHist) / mediaHist) * 100
    // Mes pico ventas
    const mesPico = (historico.data ?? []).reduce((max, m) => m.unidades_vendidas > max.unidades_vendidas ? m : max, (historico.data ?? [])[0])
    return {
      mediaHist,
      ultimoPrecio,
      desviacionPct,
      mesPico: mesPico?.mes ?? null,
      esOportunidadCompra: desviacionPct < -10,
    }
  }, [historico.data])

  return (
    <Modal onClose={onClose} size="4xl">
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
            Coste manual (override)
            {!byName && (costeManual.data ?? []).length > 0 && (
              <span className="ml-2 rounded-full bg-[oklch(92%_.08_82_/_0.85)] px-2 py-0.5 text-xs text-[var(--color-primary)] dark:bg-[oklch(28%_.08_72_/_0.42)]">
                {(costeManual.data ?? []).length} entrada{(costeManual.data ?? []).length > 1 ? 's' : ''}
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-ink-3)]">
            {byName
              ? 'Este producto no está enlazado a Holded (entra por factura PDF). El coste se fija por nombre y manda sobre cualquier cálculo automático.'
              : 'El coste vigente en cada venta es el override más reciente con fecha ≤ fecha de la venta. El histórico queda intacto.'}
          </p>

          {/* Modo product_id: historial de overrides con fecha */}
          {!byName && (costeManual.data ?? []).length > 0 && (
            <ul className="mt-2 space-y-1">
              {(costeManual.data ?? []).map(row => (
                <li key={row.fecha_desde} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-[var(--color-ink-3)]">{format(parseISO(row.fecha_desde), 'd LLL yyyy', { locale: es })}</span>
                  <span className="font-medium tabular-nums text-[var(--color-ink)]">{eur(row.coste_eur)}/ud</span>
                  {row.nota && <span className="flex-1 truncate text-xs text-[var(--color-ink-3)]">{row.nota}</span>}
                  <button
                    type="button"
                    onClick={() => quitarCoste(row.fecha_desde)}
                    disabled={delCoste.isPending}
                    className="ml-auto text-xs text-[var(--coral)] hover:underline disabled:opacity-40"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Modo nombre: valor único vigente */}
          {byName && costeManualNm.data && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm">
              <span className="font-medium tabular-nums text-[var(--color-ink)]">{eur(costeManualNm.data.coste_eur)}/ud</span>
              {costeManualNm.data.nota && <span className="flex-1 truncate text-xs text-[var(--color-ink-3)]">{costeManualNm.data.nota}</span>}
              <button
                type="button"
                onClick={quitarCosteNombre}
                disabled={delCosteNm.isPending}
                className="ml-auto text-xs text-[var(--coral)] hover:underline disabled:opacity-40"
              >
                Quitar
              </button>
            </div>
          )}

          {/* Formulario nuevo coste */}
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {!byName && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Desde</label>
                <Input
                  type="date"
                  value={costeDraft.fecha_desde}
                  onChange={(e) => setCosteDraft(p => ({ ...p, fecha_desde: e.target.value }))}
                  className="h-9 w-36"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Coste €/ud</label>
              <Input
                type="number" step="0.0001" min="0" placeholder="0.00"
                value={costeDraft.coste}
                onChange={(e) => setCosteDraft(p => ({ ...p, coste: e.target.value }))}
                className="h-9 w-28 tabular-nums"
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Nota (opcional)</label>
              <Input
                value={costeDraft.nota}
                onChange={(e) => setCosteDraft(p => ({ ...p, nota: e.target.value }))}
                placeholder="bajada precio trops…"
                className="h-9"
              />
            </div>
            <Button size="sm" onClick={guardarCoste} disabled={!costeDraft.coste || (!byName && !costeDraft.fecha_desde) || guardandoCoste}>
              {guardandoCoste ? 'Guardando…' : byName ? (costeManualNm.data ? 'Actualizar coste' : 'Fijar coste') : 'Añadir override'}
            </Button>
          </div>
        </section>

        {/* Histórico mensual + estacionalidad */}
        {historico.data && historico.data.length > 0 && (
          <section className="border-b border-[var(--color-border)] px-5 py-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Histórico mensual (12 meses)</h3>
              {analisis?.esOportunidadCompra && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--mint-glow)] px-2 py-0.5 text-xs font-semibold text-[var(--mint)]">
                  <TrendingDown className="h-3 w-3" />
                  Oportunidad de compra: precio {Math.abs(analisis.desviacionPct).toFixed(0)}% bajo media
                </span>
              )}
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={historico.data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="mes"
                    tickFormatter={(d) => format(parseISO(d), 'LLL', { locale: es })}
                    fontSize={11} stroke="var(--color-ink-3)"
                  />
                  <YAxis yAxisId="ud" fontSize={10} stroke="var(--color-ink-3)" width={45} tickFormatter={(n) => `${(n/1).toFixed(0)}`} />
                  <YAxis yAxisId="precio" orientation="right" fontSize={10} stroke="var(--color-ink-3)" width={45} tickFormatter={(n) => `${Number(n).toFixed(2)}€`} />
                  <Tooltip
                    formatter={(v, name) => {
                      if (name === 'Precio compra' || name === 'Precio venta') return `${Number(v).toFixed(3)}€/ud`
                      return `${Number(v).toFixed(0)} ud`
                    }}
                    labelFormatter={(d) => typeof d === 'string' ? format(parseISO(d), "LLLL yyyy", { locale: es }) : String(d)}
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="ud" dataKey="unidades_vendidas" name="Vendidas (ud)" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="ud" dataKey="unidades_compradas" name="Compradas (ud)" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="precio" dataKey="precio_compra_medio" name="Precio compra" type="monotone" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="precio" dataKey="precio_venta_medio"  name="Precio venta"  type="monotone" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {analisis && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                <div>
                  <div className="text-[var(--color-ink-3)]">Coste medio histórico</div>
                  <div className="font-medium tabular-nums">{eur(analisis.mediaHist)}</div>
                </div>
                <div>
                  <div className="text-[var(--color-ink-3)]">Coste último mes</div>
                  <div className={`font-medium tabular-nums ${analisis.desviacionPct >= 0 ? 'text-[var(--color-primary)]' : 'text-[var(--mint)]'}`}>
                    {eur(analisis.ultimoPrecio)} ({analisis.desviacionPct >= 0 ? '+' : ''}{analisis.desviacionPct.toFixed(0)}%)
                  </div>
                </div>
                {analisis.mesPico && (
                  <div>
                    <div className="text-[var(--color-ink-3)]">Mes con más venta</div>
                    <div className="font-medium">{format(parseISO(analisis.mesPico), 'LLLL', { locale: es })}</div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

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
                      <div className="text-xs text-[var(--mint)]">{eur(c.margen)} {c.margen_pct == null ? '' : `(${c.margen_pct.toFixed(0)}%)`}</div>
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
    </Modal>
  )
}

function Tile({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: 'neutral'|'positive'|'warning' }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</div>
      <div className={`font-display text-base font-bold ${tone === 'positive' ? 'text-[var(--mint)]' : tone === 'warning' ? 'text-[var(--color-primary)]' : 'text-[var(--color-ink)]'}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--color-ink-3)]">{sub}</div>}
    </div>
  )
}
