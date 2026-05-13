import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Input } from '@/shared/components/ui/input'
import { euros, eurosShort } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { type GastoUnificado, useGastosUnificados, useSerieMensual } from '../lib/hooks'

type DimRow = 'mes' | 'categoria' | 'proveedor'
type DimCol = 'none' | 'categoria' | 'proveedor' | 'tipo'

const RANGOS = [
  { key: 'mes',     label: 'Mes' },
  { key: 'trim',    label: '3 meses' },
  { key: 'sem',     label: '6 meses' },
  { key: 'anio',    label: 'Año' },
  { key: 'custom',  label: 'Personalizado' },
] as const
type RangoKey = typeof RANGOS[number]['key']

function rangeFor(rango: RangoKey, anchor: Date): { from: string; to: string } {
  const today = new Date()
  if (rango === 'mes')  return { from: format(startOfMonth(anchor), 'yyyy-MM-dd'), to: format(endOfMonth(anchor), 'yyyy-MM-dd') }
  if (rango === 'trim') return { from: format(startOfMonth(subMonths(today, 2)), 'yyyy-MM-dd'), to: format(endOfMonth(today), 'yyyy-MM-dd') }
  if (rango === 'sem')  return { from: format(startOfMonth(subMonths(today, 5)), 'yyyy-MM-dd'), to: format(endOfMonth(today), 'yyyy-MM-dd') }
  if (rango === 'anio') return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` }
  return { from: format(startOfMonth(anchor), 'yyyy-MM-dd'), to: format(endOfMonth(anchor), 'yyyy-MM-dd') }
}

type Props = { anchor: Date }

export function StatsView({ anchor }: Props) {
  const [rango, setRango] = useState<RangoKey>('sem')
  const [customFrom, setCustomFrom] = useState<string>(format(startOfMonth(subMonths(anchor, 5)), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState<string>(format(endOfMonth(anchor), 'yyyy-MM-dd'))
  const [dimRow, setDimRow] = useState<DimRow>('mes')
  const [dimCol, setDimCol] = useState<DimCol>('categoria')

  const range = rango === 'custom' ? { from: customFrom, to: customTo } : rangeFor(rango, anchor)
  const { data: gastos = [], isLoading } = useGastosUnificados(range.from, range.to)
  const { data: serie = [] } = useSerieMensual(12)

  const total = gastos.reduce((acc, g) => acc + g.total, 0)

  const pivot = useMemo(() => buildPivot(gastos, dimRow, dimCol), [gastos, dimRow, dimCol])
  const porCategoria = useMemo(() => groupTotals(gastos, (g) => g.categoria_nombre ?? 'Sin categoría', (g) => g.categoria_color ?? '#64748b'), [gastos])
  const porProveedor = useMemo(() => groupTotals(gastos, (g) => g.proveedor, () => '#10b981'), [gastos])
  const topProv      = porProveedor.slice(0, 5)

  const stackedMensual = useMemo(() => buildStackedMensual(gastos), [gastos])

  return (
    <div className="space-y-4">
      {/* Toolbar rango */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
        <div className="flex gap-1">
          {RANGOS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRango(r.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                rango === r.key
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        {rango === 'custom' && (
          <div className="flex items-center gap-1">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs" />
            <span className="text-[var(--color-ink-3)]">→</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs" />
          </div>
        )}
        <div className="ml-auto text-xs text-[var(--color-ink-3)] tabular-nums">
          {gastos.length} apuntes · <span className="font-semibold text-[var(--color-primary-2)]">{euros(total)}</span>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Evolución mensual (12m)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={serie} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <XAxis
                dataKey="mes_iso"
                tickFormatter={(d: string) => format(parseISO(d), 'LLL', { locale: es })}
                tick={{ fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(n: number) => eurosShort(n)} />
              <Tooltip
                labelFormatter={((d: any) => format(parseISO(String(d)), "MMMM yyyy", { locale: es })) as any}
                formatter={((v: any, name: any) => [euros(Number(v)), nameMap(String(name))]) as any}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => nameMap(v)} />
              <Line type="monotone" dataKey="fijos_total"     stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="variables_total" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="total"           stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={`Categorías (${rangoLabel(rango)})`}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={porCategoria}
                dataKey="total"
                nameKey="key"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {porCategoria.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={((v: any) => euros(Number(v))) as any} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top 5 proveedores">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topProv} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(n: number) => eurosShort(n)} />
              <YAxis type="category" dataKey="key" tick={{ fontSize: 11 }} width={100} />
              <Tooltip formatter={((v: any) => euros(Number(v))) as any} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="total" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Mes × Categoría (apilado)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stackedMensual.rows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <XAxis
                dataKey="mes_iso"
                tickFormatter={(d: string) => format(parseISO(d), 'LLL', { locale: es })}
                tick={{ fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(n: number) => eurosShort(n)} />
              <Tooltip
                labelFormatter={((d: any) => format(parseISO(String(d)), "MMMM yyyy", { locale: es })) as any}
                formatter={((v: any, name: any) => [euros(Number(v)), String(name)]) as any}
                contentStyle={{ fontSize: 12 }}
              />
              {stackedMensual.cats.map((c) => (
                <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Pivot dinámica */}
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">Tabla dinámica</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-[var(--color-ink-3)]">
              Filas
              <select value={dimRow} onChange={(e) => setDimRow(e.target.value as DimRow)} className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs">
                <option value="mes">Mes</option>
                <option value="categoria">Categoría</option>
                <option value="proveedor">Proveedor</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-[var(--color-ink-3)]">
              Columnas
              <select value={dimCol} onChange={(e) => setDimCol(e.target.value as DimCol)} className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs">
                <option value="none">— ninguna —</option>
                <option value="categoria">Categoría</option>
                <option value="proveedor">Proveedor</option>
                <option value="tipo">Fijo / Variable</option>
              </select>
            </label>
          </div>
        </div>

        {isLoading ? (
          <div className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">Cargando…</div>
        ) : pivot.rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">Sin datos en el rango.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-2)]">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                  <th className="px-3 py-2">{dimLabel(dimRow)}</th>
                  {pivot.cols.map((c) => (
                    <th key={c} className="px-3 py-2 text-right">{c}</th>
                  ))}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {pivot.rows.map((r) => (
                  <tr key={r.key} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2 text-[var(--color-ink)]">{r.label}</td>
                    {pivot.cols.map((c) => (
                      <td key={c} className="px-3 py-2 text-right tabular-nums text-[var(--color-ink-2)]">
                        {r.cells[c] ? euros(r.cells[c]) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--color-ink)]">
                      {euros(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <tr>
                  <td className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Total</td>
                  {pivot.cols.map((c) => (
                    <td key={c} className="px-3 py-2 text-right tabular-nums text-[var(--color-ink-3)]">
                      {pivot.colTotals[c] ? euros(pivot.colTotals[c]) : '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-[var(--color-primary-2)]">{euros(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{title}</div>
      {children}
    </div>
  )
}

function dimLabel(d: DimRow): string {
  return d === 'mes' ? 'Mes' : d === 'categoria' ? 'Categoría' : 'Proveedor'
}

function rangoLabel(r: RangoKey): string {
  return r === 'mes' ? 'mes' : r === 'trim' ? '3m' : r === 'sem' ? '6m' : r === 'anio' ? 'año' : 'rango'
}

function nameMap(name: string): string {
  if (name === 'fijos_total')     return 'Fijos'
  if (name === 'variables_total') return 'Variables'
  if (name === 'total')           return 'Total'
  return name
}

type GroupedRow = { key: string; total: number; color: string }

function groupTotals(
  rows: GastoUnificado[],
  keyFn: (g: GastoUnificado) => string,
  colorFn: (g: GastoUnificado) => string,
): GroupedRow[] {
  const map = new Map<string, { total: number; color: string }>()
  for (const r of rows) {
    const k = keyFn(r)
    const cur = map.get(k) ?? { total: 0, color: colorFn(r) }
    cur.total += r.total
    map.set(k, cur)
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, total: v.total, color: v.color }))
    .sort((a, b) => b.total - a.total)
}

type StackedMensual = {
  rows: Array<Record<string, number | string>>
  cats: Array<{ key: string; color: string }>
}

function buildStackedMensual(rows: GastoUnificado[]): StackedMensual {
  // Agrupa rows por mes_iso×categoría. Limita a top 6 cats + "Otros".
  const totByCat = new Map<string, { total: number; color: string }>()
  for (const r of rows) {
    const k = r.categoria_nombre ?? 'Sin categoría'
    const cur = totByCat.get(k) ?? { total: 0, color: r.categoria_color ?? '#64748b' }
    cur.total += r.total
    totByCat.set(k, cur)
  }
  const topCats = Array.from(totByCat.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 6)
    .map(([key, v]) => ({ key, color: v.color }))
  const topSet = new Set(topCats.map((c) => c.key))
  const cats = [...topCats, { key: 'Otros', color: '#94a3b8' }]

  const byMes = new Map<string, Record<string, number | string>>()
  for (const r of rows) {
    const mesIso = `${r.anio}-${String(r.mes).padStart(2, '0')}-01`
    const row = byMes.get(mesIso) ?? { mes_iso: mesIso }
    const k = r.categoria_nombre ?? 'Sin categoría'
    const bucket = topSet.has(k) ? k : 'Otros'
    row[bucket] = ((row[bucket] as number) ?? 0) + r.total
    byMes.set(mesIso, row)
  }
  const sorted = Array.from(byMes.values()).sort((a, b) => String(a.mes_iso).localeCompare(String(b.mes_iso)))
  return { rows: sorted, cats }
}

type PivotRow = { key: string; label: string; total: number; cells: Record<string, number> }
type PivotResult = {
  rows: PivotRow[]
  cols: string[]
  colTotals: Record<string, number>
}

function buildPivot(rows: GastoUnificado[], dimRow: DimRow, dimCol: DimCol): PivotResult {
  const rowKey = (g: GastoUnificado): { key: string; label: string } => {
    if (dimRow === 'mes')       return { key: `${g.anio}-${String(g.mes).padStart(2, '0')}`, label: format(new Date(g.anio, g.mes - 1, 1), 'MMM yyyy', { locale: es }) }
    if (dimRow === 'categoria') return { key: g.categoria_id ?? '_sin', label: g.categoria_nombre ?? 'Sin categoría' }
    return { key: g.proveedor_clave, label: g.proveedor }
  }
  const colKey = (g: GastoUnificado): string | null => {
    if (dimCol === 'none')      return null
    if (dimCol === 'categoria') return g.categoria_nombre ?? 'Sin categoría'
    if (dimCol === 'proveedor') return g.proveedor
    return g.tipo === 'fijo' ? 'Fijo' : 'Variable'
  }

  const rowMap = new Map<string, PivotRow>()
  const colSet = new Set<string>()
  const colTotals: Record<string, number> = {}

  for (const g of rows) {
    const rk = rowKey(g)
    const ck = colKey(g)
    let r = rowMap.get(rk.key)
    if (!r) { r = { key: rk.key, label: rk.label, total: 0, cells: {} }; rowMap.set(rk.key, r) }
    r.total += g.total
    if (ck) {
      colSet.add(ck)
      r.cells[ck] = (r.cells[ck] ?? 0) + g.total
      colTotals[ck] = (colTotals[ck] ?? 0) + g.total
    }
  }

  const sortedRows = Array.from(rowMap.values()).sort((a, b) => {
    if (dimRow === 'mes') return a.key.localeCompare(b.key)
    return b.total - a.total
  })
  const cols = Array.from(colSet).sort((a, b) => (colTotals[b] ?? 0) - (colTotals[a] ?? 0))

  return { rows: sortedRows, cols, colTotals }
}
