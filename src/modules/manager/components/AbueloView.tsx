import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { euros } from '@/shared/lib/format'
import type { Period } from '../lib/period'
import {
  useAbueloFacturas, useAbueloLineas,
  useAddAbueloFactura, useDeleteAbueloFactura,
} from '../lib/queries'
import { ProductoAutocomplete } from './ProductoAutocomplete'

type IvaRate = 4 | 10 | 21
const IVA_RATES: IvaRate[] = [4, 10, 21]

interface LineaForm {
  product_id: string | null
  nombre: string
  units: string
  price: string  // SIN IVA
  tax_rate: IvaRate
}

const eur = euros
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL yyyy', { locale: es })
const lineaSubtotal = (l: LineaForm) => {
  const u = Number(l.units.replace(',', '.')) || 0
  const p = Number(l.price.replace(',', '.')) || 0
  return u * p
}
const lineaIva = (l: LineaForm) => lineaSubtotal(l) * (l.tax_rate / 100)
const lineaTotal = (l: LineaForm) => lineaSubtotal(l) + lineaIva(l)
const normalizeIva = (n: number | null | undefined): IvaRate => {
  if (n == null) return 4
  const r = Math.round(Number(n))
  if (r === 10) return 10
  if (r === 21) return 21
  return 4
}
const nuevaLinea = (): LineaForm => ({ product_id: null, nombre: '', units: '1', price: '', tax_rate: 4 })

interface Props {
  period: Period
}

export function AbueloView({ period }: Props) {
  const { data, isLoading } = useAbueloFacturas(period)
  const add = useAddAbueloFactura()
  const del = useDeleteAbueloFactura()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const today = format(new Date(), 'yyyy-MM-dd')
  const [fecha, setFecha] = useState(today)
  const [numero, setNumero] = useState('')
  const [nota, setNota] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([nuevaLinea()])

  const subtotalForm = useMemo(() => lineas.reduce((s, l) => s + lineaSubtotal(l), 0), [lineas])
  const ivaForm = useMemo(() => lineas.reduce((s, l) => s + lineaIva(l), 0), [lineas])
  const totalForm = subtotalForm + ivaForm
  const totalPeriodo = useMemo(() => (data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0), [data])
  const subtotalPeriodo = useMemo(() => (data ?? []).reduce((s, r) => s + Number(r.subtotal ?? 0), 0), [data])

  const updateLinea = (i: number, patch: Partial<LineaForm>) => {
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }
  const removeLinea = (i: number) => {
    setLineas(prev => prev.length === 1 ? [nuevaLinea()] : prev.filter((_, idx) => idx !== i))
  }

  const guardar = async () => {
    const lineasValidas = lineas
      .map(l => ({
        product_id: l.product_id,
        nombre: l.nombre.trim(),
        units: Number(l.units.replace(',', '.')),
        price: Number(l.price.replace(',', '.')),
        tax_rate: l.tax_rate,
      }))
      .filter(l => l.nombre && Number.isFinite(l.units) && l.units > 0 && Number.isFinite(l.price) && l.price >= 0)
    if (!fecha || lineasValidas.length === 0) {
      toast({ title: 'Añade fecha y al menos una línea válida (producto, ud, precio)', variant: 'error' })
      return
    }
    try {
      await add.mutateAsync({
        fecha, numero_factura: numero.trim() || null, nota: nota.trim() || null,
        lineas: lineasValidas,
      })
      // Reset
      setFecha(today); setNumero(''); setNota(''); setLineas([nuevaLinea()])
      toast({ title: 'Factura guardada', variant: 'success' })
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const onBorrar = async (id: string) => {
    const ok = await confirm({
      title: '¿Borrar esta factura del Abuelo?',
      description: 'Se eliminan también sus líneas. No se puede deshacer.',
      confirmLabel: 'Borrar',
      variant: 'danger',
    })
    if (!ok) return
    try { await del.mutateAsync(id) }
    catch (e) { toast({ title: 'No se pudo borrar', description: e instanceof Error ? e.message : '', variant: 'error' }) }
  }

  return (
    <div className="space-y-3">
      <header className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">Frutería propia (El Abuelo)</h2>
        <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
          Ventas que no pasan por Holded. Factura completa con líneas para análisis interno.
        </p>
      </header>

      {/* Form factura */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">Nueva factura</h3>
          <div className="flex items-baseline gap-3 text-sm tabular-nums">
            <span className="text-[var(--color-ink-3)]">Subtotal {eur(subtotalForm)}</span>
            <span className="text-[var(--color-ink-3)]">IVA {eur(ivaForm)}</span>
            <span className="text-base font-bold text-emerald-700">Total {eur(totalForm)}</span>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[160px_140px_1fr]">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Fecha</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Nº factura</label>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="opcional" className="h-9" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Nota</label>
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="opcional" className="h-9" />
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Líneas</span>
            <Button size="sm" variant="outline" onClick={() => setLineas(prev => [...prev, nuevaLinea()])}>
              <Plus className="mr-1 h-3 w-3" />Añadir línea
            </Button>
          </div>
          <ul className="space-y-3 md:space-y-2">
            {lineas.map((l, i) => (
              <li key={i} className="rounded-lg border border-[var(--color-border)] p-2 md:border-0 md:p-0">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_70px_90px_70px_110px_auto] md:items-end">
                  <ProductoAutocomplete
                    value={l.nombre}
                    onChange={(v) => updateLinea(i, { nombre: v, product_id: null })}
                    onPick={(p) => updateLinea(i, {
                      nombre: p.nombre,
                      product_id: p.product_id,
                      price: p.ultimo_precio == null ? l.price : String(Number(p.ultimo_precio).toFixed(2)),
                      tax_rate: normalizeIva(p.tax_rate_ultimo),
                    })}
                    placeholder="Producto (busca en catálogo)"
                  />
                  <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-end gap-2 md:contents">
                    <Input
                      type="number" step="0.01" min="0" placeholder="Ud"
                      value={l.units}
                      onChange={(e) => updateLinea(i, { units: e.target.value })}
                      className="h-9 tabular-nums text-right"
                    />
                    <Input
                      type="number" step="0.01" min="0" placeholder="Precio s/IVA"
                      value={l.price}
                      onChange={(e) => updateLinea(i, { price: e.target.value })}
                      className="h-9 tabular-nums text-right"
                    />
                    <select
                      value={l.tax_rate}
                      onChange={(e) => updateLinea(i, { tax_rate: Number(e.target.value) as IvaRate })}
                      className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm tabular-nums text-[var(--color-ink)]"
                      title="Tipo de IVA"
                    >
                      {IVA_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                    <span className="px-2 text-right text-sm tabular-nums text-[var(--color-ink)]">
                      <span className="block font-medium">{eur(lineaTotal(l))}</span>
                      <span className="block text-[10px] text-[var(--color-ink-3)]">{eur(lineaSubtotal(l))} + {eur(lineaIva(l))}</span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => removeLinea(i)} title="Eliminar línea">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
          <span className="text-sm text-[var(--color-ink-3)]">{lineas.filter(l => l.nombre.trim()).length} producto(s)</span>
          <div className="flex items-baseline gap-3 text-sm tabular-nums">
            <span className="text-[var(--color-ink-3)]">Subtotal {eur(subtotalForm)}</span>
            <span className="text-[var(--color-ink-3)]">IVA {eur(ivaForm)}</span>
            <span className="text-base font-bold text-emerald-700">Total {eur(totalForm)}</span>
            <Button onClick={guardar} disabled={totalForm <= 0 || add.isPending}>
              {add.isPending ? 'Guardando…' : 'Guardar factura'}
            </Button>
          </div>
        </div>
      </section>

      {/* Lista facturas */}
      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">Facturas del periodo</h3>
          <div className="flex items-baseline gap-3 text-sm tabular-nums">
            <span className="text-[var(--color-ink-3)]">Subtotal {eur(subtotalPeriodo)}</span>
            <span className="font-medium text-emerald-700">Total {eur(totalPeriodo)}</span>
          </div>
        </div>
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {data?.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin facturas en este periodo</p>}
        <ul className="divide-y divide-[var(--color-border)]">
          {data?.map(f => (
            <li key={f.id}>
              <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2 text-sm md:grid-cols-[100px_120px_1fr_auto_auto_auto] md:gap-3 md:px-4">
                <div className="min-w-0 md:contents">
                  <div className="md:contents">
                    <span className="text-xs text-[var(--color-ink-3)] md:text-sm">{fmt(f.fecha)}</span>
                    <span className="text-xs text-[var(--color-ink)] md:text-sm">{f.numero_factura ? `#${f.numero_factura}` : '—'}</span>
                    <span className="truncate text-[var(--color-ink)]">{f.nota ?? '—'}</span>
                    <span className="hidden text-xs text-[var(--color-ink-3)] md:inline">{f.num_lineas} líneas</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:contents">
                  <span className="text-right tabular-nums text-[var(--color-ink)]">
                    <span className="block font-medium">{eur(Number(f.total))}</span>
                    <span className="block text-[10px] text-[var(--color-ink-3)]">s/IVA {eur(Number(f.subtotal))}</span>
                  </span>
                  <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}>
                    {expandedId === f.id ? 'Ocultar' : 'Ver'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onBorrar(f.id)} disabled={del.isPending}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
                </div>
              </div>
              {expandedId === f.id && <FacturaLineasInline facturaId={f.id} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function FacturaLineasInline({ facturaId }: { facturaId: string }) {
  const { data, isLoading } = useAbueloLineas(facturaId)
  return (
    <div className="border-t border-[var(--color-border)] bg-[color:rgba(0,0,0,0.02)] px-4 py-2">
      {isLoading && <p className="text-xs text-[var(--color-ink-3)]">Cargando líneas…</p>}
      <ul className="space-y-1">
        {data?.map(l => {
          const sub = Number(l.subtotal)
          const iva = sub * Number(l.tax_rate) / 100
          return (
            <li key={l.id} className="grid grid-cols-[1fr_60px_80px_50px_90px] gap-2 text-xs tabular-nums">
              <span className="truncate text-[var(--color-ink)]">{l.nombre}</span>
              <span className="text-right text-[var(--color-ink-3)]">{Number(l.units).toFixed(2)} ud</span>
              <span className="text-right text-[var(--color-ink-3)]">{eur(Number(l.price))}</span>
              <span className="text-right text-[var(--color-ink-3)]">{Number(l.tax_rate)}%</span>
              <span className="text-right text-[var(--color-ink)]">
                <span className="block">{eur(sub + iva)}</span>
                <span className="block text-[10px] text-[var(--color-ink-3)]">s/IVA {eur(sub)}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
