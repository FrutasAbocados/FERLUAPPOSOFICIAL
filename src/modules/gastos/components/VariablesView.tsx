import { useMemo, useState } from 'react'
import { Pencil, Plus, Search, X } from 'lucide-react'
import { endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { euros } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { type Variable, useCategorias, useProveedoresManuales, useVariables } from '../lib/hooks'
import { CategoriaBadge, CategoriaPicker } from './CategoriaPicker'
import { VariableModal } from './VariableModal'

type Props = {
  anchor: Date
}

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
  if (rango === 'mes') {
    return { from: format(startOfMonth(anchor), 'yyyy-MM-dd'), to: format(endOfMonth(anchor), 'yyyy-MM-dd') }
  }
  if (rango === 'trim') {
    return { from: format(startOfMonth(subMonths(today, 2)), 'yyyy-MM-dd'), to: format(endOfMonth(today), 'yyyy-MM-dd') }
  }
  if (rango === 'sem') {
    return { from: format(startOfMonth(subMonths(today, 5)), 'yyyy-MM-dd'), to: format(endOfMonth(today), 'yyyy-MM-dd') }
  }
  if (rango === 'anio') {
    return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` }
  }
  return { from: format(startOfMonth(anchor), 'yyyy-MM-dd'), to: format(endOfMonth(anchor), 'yyyy-MM-dd') }
}

export function VariablesView({ anchor }: Props) {
  const [rango, setRango] = useState<RangoKey>('mes')
  const [customFrom, setCustomFrom] = useState<string>(format(startOfMonth(anchor), 'yyyy-MM-dd'))
  const [customTo, setCustomTo]     = useState<string>(format(endOfMonth(anchor), 'yyyy-MM-dd'))
  const [categoria, setCategoria]   = useState<string | null>(null)
  const [q, setQ]                   = useState('')
  const [editing, setEditing]       = useState<Variable | null | 'new'>(null)

  const range = rango === 'custom'
    ? { from: customFrom, to: customTo }
    : rangeFor(rango, anchor)

  const { data: variables = [], isLoading } = useVariables({ from: range.from, to: range.to, categoria_id: categoria, q })
  const { data: categorias = [] } = useCategorias()
  const { data: manuales = [] } = useProveedoresManuales()

  const manualesById = useMemo(() => new Map(manuales.map((m) => [m.id, m])), [manuales])
  const catsById = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])

  const total = variables.reduce((acc, v) => acc + v.total, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">Variables</h2>
          <span className="text-xs text-[var(--color-ink-3)] tabular-nums">
            {variables.length} apuntes · {euros(total)}
          </span>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo gasto
        </Button>
      </div>

      {/* Filtros */}
      <div className="ao-panel flex flex-wrap items-center gap-2 p-3">
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

        <div className="ml-auto flex items-center gap-2">
          <div className="w-40 md:w-48">
            <CategoriaPicker
              value={categoria}
              onChange={setCategoria}
              emptyLabel="Todas las categorías"
              className="h-8 py-1 text-xs"
            />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <Input
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 w-44 pl-7 text-xs"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="ao-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[rgba(255,255,255,.025)]">
              <tr className="label-caps text-left">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="px-3 py-2 text-right">IVA</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-[var(--color-ink-3)]">Cargando…</td></tr>}
              {!isLoading && variables.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[var(--color-ink-3)]">Sin gastos en este rango.</td></tr>
              )}
              {variables.map((v) => {
                const cat = v.categoria_id ? catsById.get(v.categoria_id) : null
                const proveedorLabel =
                  v.proveedor_holded_nombre ??
                  (v.proveedor_manual_id ? (manualesById.get(v.proveedor_manual_id)?.nombre ?? 'Manual') : null) ??
                  v.proveedor_libre ??
                  '—'
                return (
                  <tr key={v.id} className="border-t border-[var(--color-border)] hover:bg-[rgba(255,255,255,.025)]">
                    <td className="mono px-3 py-2 tabular-nums">
                      {format(parseISO(v.fecha), 'd LLL', { locale: es })}
                    </td>
                    <td className="px-3 py-2">
                      <CategoriaBadge id={cat?.id} color={cat?.color ?? null} nombre={cat?.nombre ?? null} />
                    </td>
                    <td className="px-3 py-2 text-[var(--color-ink-2)]">{proveedorLabel}</td>
                    <td className="px-3 py-2 text-[var(--color-ink-2)]">{v.descripcion ?? '—'}</td>
                    <td className="mono px-3 py-2 text-right tabular-nums">{euros(v.subtotal)}</td>
                    <td className="mono px-3 py-2 text-right text-[var(--color-ink-3)] tabular-nums">{v.iva_pct}%</td>
                    <td className="mono px-3 py-2 text-right font-semibold tabular-nums">{euros(v.total)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {variables.length > 0 && (
              <tfoot className="border-t border-[var(--color-border)] bg-[rgba(255,255,255,.025)]">
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                    Total
                  </td>
                  <td className="mono px-3 py-2 text-right font-bold tabular-nums text-[var(--mint)]">{euros(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {editing && (
        <VariableModal
          variable={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
