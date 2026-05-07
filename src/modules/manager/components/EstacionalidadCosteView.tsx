import { useMemo, useState } from 'react'
import { TrendingDown, TrendingUp, Search } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { eurosShort } from '@/shared/lib/format'
import type { Period } from '../lib/period'
import { periodFromPreset } from '../lib/period'
import type { ProductoListItem } from '../lib/types'
import { useProductosLista } from '../lib/queries'
import { ProductoDetalleModal } from './ProductoDetalleModal'

const eur0 = eurosShort

interface Row extends ProductoListItem {
  coste_anterior: number | null
  margen_pct_anterior: number | null
  delta_coste_pct: number | null
  delta_margen_pp: number | null
}

type SortKey = 'ventas' | 'margen_pct' | 'delta_coste' | 'delta_margen'

const MIN_UNITS = 5
const ALERTA_COSTE_PCT = 15
const ALERTA_MARGEN_PCT = 10

export function EstacionalidadCosteView() {
  const periodActual = useMemo<Period>(() => periodFromPreset('mes'), [])
  const periodAnterior = useMemo<Period>(() => periodFromPreset('mes_anterior'), [])

  const actual = useProductosLista(periodActual)
  const anterior = useProductosLista(periodAnterior)

  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('ventas')
  const [filtroAlerta, setFiltroAlerta] = useState<'todos' | 'caida_margen' | 'subida_coste'>('todos')
  const [selected, setSelected] = useState<ProductoListItem | null>(null)

  const rows = useMemo<Row[]>(() => {
    const prev = new Map<string, ProductoListItem>()
    for (const p of anterior.data ?? []) if (p.product_id) prev.set(p.product_id, p)

    return (actual.data ?? [])
      .filter((p) => p.product_id && p.unidades >= MIN_UNITS)
      .map((p) => {
        const a = prev.get(p.product_id!)
        const coste_anterior = a?.coste_unidad ?? null
        const margen_pct_anterior = a?.margen_pct ?? null
        const delta_coste_pct =
          coste_anterior != null && coste_anterior > 0 && p.coste_unidad != null
            ? ((p.coste_unidad - coste_anterior) / coste_anterior) * 100
            : null
        const delta_margen_pp =
          margen_pct_anterior != null && p.margen_pct != null
            ? p.margen_pct - margen_pct_anterior
            : null
        return { ...p, coste_anterior, margen_pct_anterior, delta_coste_pct, delta_margen_pp }
      })
  }, [actual.data, anterior.data])

  const filtered = useMemo(() => {
    let r = rows
    const qq = q.trim().toLowerCase()
    if (qq) r = r.filter((p) => p.nombre.toLowerCase().includes(qq))
    if (filtroAlerta === 'caida_margen') {
      r = r.filter((p) => p.delta_margen_pp != null && p.delta_margen_pp < -2)
    } else if (filtroAlerta === 'subida_coste') {
      r = r.filter((p) => p.delta_coste_pct != null && p.delta_coste_pct > ALERTA_COSTE_PCT)
    }
    return [...r].sort((a, b) => {
      switch (sortKey) {
        case 'ventas':
          return b.ventas - a.ventas
        case 'margen_pct':
          return (a.margen_pct ?? 999) - (b.margen_pct ?? 999)
        case 'delta_coste':
          return (b.delta_coste_pct ?? -Infinity) - (a.delta_coste_pct ?? -Infinity)
        case 'delta_margen':
          return (a.delta_margen_pp ?? Infinity) - (b.delta_margen_pp ?? Infinity)
      }
    })
  }, [rows, q, sortKey, filtroAlerta])

  const kpis = useMemo(() => {
    const margenes = rows.map((r) => r.margen_pct).filter((m): m is number => m != null)
    const margenMedio = margenes.length > 0 ? margenes.reduce((s, m) => s + m, 0) / margenes.length : null
    const margenBajo = rows.filter((r) => r.margen_pct != null && r.margen_pct < ALERTA_MARGEN_PCT).length
    const subidaCoste = rows.filter(
      (r) => r.delta_coste_pct != null && r.delta_coste_pct > ALERTA_COSTE_PCT,
    ).length
    const caidaMargen = rows.filter(
      (r) => r.delta_margen_pp != null && r.delta_margen_pp < -2,
    ).length
    return { margenMedio, margenBajo, subidaCoste, caidaMargen, total: rows.length }
  }, [rows])

  const isLoading = actual.isLoading || anterior.isLoading

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <p className="text-sm text-[var(--color-ink-2)]">
          Compara coste y margen del <strong>mes actual</strong> ({periodActual.from} → {periodActual.to}) vs{' '}
          <strong>mes anterior</strong>. Solo productos con ≥ {MIN_UNITS} unidades vendidas este mes.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Margen medio"
          value={kpis.margenMedio == null ? '—' : `${kpis.margenMedio.toFixed(1)}%`}
          hint={`${kpis.total} productos`}
        />
        <KpiCard
          label="Margen bajo"
          value={String(kpis.margenBajo)}
          hint={`< ${ALERTA_MARGEN_PCT}% margen`}
          tone={kpis.margenBajo > 0 ? 'warn' : undefined}
        />
        <KpiCard
          label="Coste al alza"
          value={String(kpis.subidaCoste)}
          hint={`> +${ALERTA_COSTE_PCT}% vs mes anterior`}
          tone={kpis.subidaCoste > 0 ? 'warn' : undefined}
        />
        <KpiCard
          label="Margen a la baja"
          value={String(kpis.caidaMargen)}
          hint="< −2pp vs mes anterior"
          tone={kpis.caidaMargen > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
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
            { k: 'ventas', l: 'Ventas' },
            { k: 'margen_pct', l: '% margen ↑' },
            { k: 'delta_coste', l: 'Δ coste ↑' },
            { k: 'delta_margen', l: 'Δ margen ↓' },
          ] as Array<{ k: SortKey; l: string }>).map((o) => (
            <Button
              key={o.k}
              size="sm"
              variant={sortKey === o.k ? 'primary' : 'outline'}
              onClick={() => setSortKey(o.k)}
              className="shrink-0"
            >
              {o.l}
            </Button>
          ))}
        </div>
        <div className="-mx-3 flex items-center gap-1 overflow-x-auto px-3 no-scrollbar md:mx-0 md:px-0">
          <span className="shrink-0 text-xs text-[var(--color-ink-3)]">Filtro:</span>
          {([
            { k: 'todos', l: 'Todos' },
            { k: 'caida_margen', l: 'Caída margen' },
            { k: 'subida_coste', l: 'Subida coste' },
          ] as Array<{ k: typeof filtroAlerta; l: string }>).map((o) => (
            <Button
              key={o.k}
              size="sm"
              variant={filtroAlerta === o.k ? 'primary' : 'outline'}
              onClick={() => setFiltroAlerta(o.k)}
              className="shrink-0"
            >
              {o.l}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-[var(--color-ink-3)] tabular-nums">{filtered.length} productos</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin productos que cumplan el filtro</p>
        )}

        <div className="hidden md:grid md:grid-cols-[1fr_repeat(5,_120px)] md:gap-2 md:border-b md:border-[var(--color-border)] md:px-4 md:py-2 md:text-xs md:font-semibold md:uppercase md:tracking-wider md:text-[var(--color-ink-3)]">
          <div>Producto</div>
          <div className="text-right">Ventas mes</div>
          <div className="text-right">Coste/ud</div>
          <div className="text-right">Δ coste</div>
          <div className="text-right">% margen</div>
          <div className="text-right">Δ margen</div>
        </div>

        <ul className="divide-y divide-[var(--color-border)]">
          {filtered.map((p) => (
            <li key={p.product_id ?? p.nombre}>
              <button
                onClick={() => setSelected(p)}
                className="grid w-full grid-cols-[1fr_auto] gap-2 px-4 py-2 text-left text-sm transition hover:bg-[var(--color-surface-2,#f8fafc)] md:grid-cols-[1fr_repeat(5,_120px)]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[var(--color-ink)]">{p.nombre}</div>
                  <div className="text-xs text-[var(--color-ink-3)]">
                    {p.unidades.toFixed(0)} ud · {p.veces} líneas
                  </div>
                </div>
                <div className="hidden text-right tabular-nums text-[var(--color-ink)] md:block">{eur0(p.ventas)}</div>
                <div className="hidden text-right tabular-nums text-[var(--color-ink)] md:block">
                  {p.coste_unidad == null ? '—' : `${p.coste_unidad.toFixed(2)}€`}
                </div>
                <div className="hidden text-right tabular-nums md:block">
                  <DeltaPct value={p.delta_coste_pct} invertColors />
                </div>
                <div className="hidden text-right tabular-nums md:block">
                  {p.margen_pct == null ? (
                    <span className="text-[var(--color-ink-3)]">—</span>
                  ) : (
                    <span
                      className={
                        p.margen_pct < ALERTA_MARGEN_PCT
                          ? 'font-semibold text-amber-700'
                          : 'text-[var(--color-ink)]'
                      }
                    >
                      {p.margen_pct.toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="hidden text-right tabular-nums md:block">
                  <DeltaPp value={p.delta_margen_pp} />
                </div>

                {/* Mobile compact */}
                <div className="text-right tabular-nums md:hidden">
                  <div className="text-[var(--color-ink)]">{eur0(p.ventas)}</div>
                  <div className="text-xs">
                    <span className="text-[var(--color-ink-2)]">{p.coste_unidad == null ? '—' : `${p.coste_unidad.toFixed(2)}€`}</span>
                    {p.delta_coste_pct != null && (
                      <span className={p.delta_coste_pct > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                        {' '}({p.delta_coste_pct > 0 ? '+' : ''}{p.delta_coste_pct.toFixed(0)}%)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-ink-3)]">
                    {p.margen_pct == null ? '—' : `${p.margen_pct.toFixed(0)}% margen`}
                    {p.delta_margen_pp != null && (
                      <span className={p.delta_margen_pp >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                        {' '}({p.delta_margen_pp >= 0 ? '+' : ''}{p.delta_margen_pp.toFixed(1)}pp)
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected && selected.product_id && (
        <ProductoDetalleModal producto={selected} period={periodActual} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'warn'
}) {
  return (
    <div
      className={
        'rounded-xl border bg-[var(--color-surface)] px-3 py-2 ' +
        (tone === 'warn'
          ? 'border-amber-300 bg-amber-50/50'
          : 'border-[var(--color-border)]')
      }
    >
      <div className="text-xs text-[var(--color-ink-3)]">{label}</div>
      <div className="mt-0.5 font-display text-xl font-bold tabular-nums text-[var(--color-ink)]">{value}</div>
      {hint && <div className="text-[10px] text-[var(--color-ink-3)]">{hint}</div>}
    </div>
  )
}

function DeltaPct({ value, invertColors }: { value: number | null; invertColors?: boolean }) {
  if (value == null) return <span className="text-[var(--color-ink-3)]">—</span>
  const positive = value > 0
  const cls = invertColors
    ? positive
      ? 'text-rose-700'
      : 'text-emerald-700'
    : positive
      ? 'text-emerald-700'
      : 'text-rose-700'
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center justify-end gap-1 ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {positive ? '+' : ''}
      {value.toFixed(0)}%
    </span>
  )
}

function DeltaPp({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[var(--color-ink-3)]">—</span>
  const positive = value >= 0
  const cls = positive ? 'text-emerald-700' : 'text-rose-700'
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center justify-end gap-1 ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {positive ? '+' : ''}
      {value.toFixed(1)}pp
    </span>
  )
}
