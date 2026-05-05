import { useMemo, useState } from 'react'
import { ChevronLeft, Search, X } from 'lucide-react'
import { format, parseISO, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Input } from '@/shared/components/ui/input'
import { euros, eurosShort } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import {
  type ClienteABC,
  useClienteFacturas,
  useClienteProductos,
  useClientesBBDD,
} from '../lib/hooks'
import { PreferenciasCard } from './PreferenciasCard'
import { NotasCard } from './NotasCard'
import { AliasesCard } from './AliasesCard'

type Props = {
  /** Si llega un cliente desde fuera (ej. click en Seguimiento), lo selecciona. */
  selected?: string | null
  onSelectChange?: (name: string | null) => void
}

const PERIODOS = [
  { key: '3m',  label: '3m'  },
  { key: '6m',  label: '6m'  },
  { key: '12m', label: '12m' },
  { key: 'ytd', label: 'YTD' },
] as const

type Periodo = typeof PERIODOS[number]['key']

function rangoFor(p: Periodo): { from: string; to: string } {
  const today = new Date()
  if (p === '3m')  return { from: format(startOfMonth(subMonths(today, 2)),  'yyyy-MM-dd'), to: format(endOfMonth(today), 'yyyy-MM-dd') }
  if (p === '6m')  return { from: format(startOfMonth(subMonths(today, 5)),  'yyyy-MM-dd'), to: format(endOfMonth(today), 'yyyy-MM-dd') }
  if (p === '12m') return { from: format(startOfMonth(subMonths(today, 11)), 'yyyy-MM-dd'), to: format(endOfMonth(today), 'yyyy-MM-dd') }
  return { from: `${today.getFullYear()}-01-01`, to: format(endOfMonth(today), 'yyyy-MM-dd') }
}

const eur = eurosShort

export function BBDDView({ selected: selectedExt, onSelectChange }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('3m')
  const [q, setQ] = useState('')
  const [filtroABC, setFiltroABC] = useState<'A' | 'B' | 'C' | null>(null)
  const [selectedInt, setSelectedInt] = useState<string | null>(null)

  const selected = selectedExt ?? selectedInt
  const setSelected = (n: string | null) => {
    setSelectedInt(n)
    onSelectChange?.(n)
  }

  const range = rangoFor(periodo)
  const { data: clientes = [], isLoading } = useClientesBBDD(range.from, range.to)

  const filtrados = useMemo(() => {
    let rows = clientes
    if (q.trim()) rows = rows.filter(c => c.contact_name_canon.toLowerCase().includes(q.trim().toLowerCase()))
    if (filtroABC) rows = rows.filter(c => c.clase === filtroABC)
    return rows
  }, [clientes, q, filtroABC])

  const clienteSel = selected ? clientes.find(c => c.contact_name_canon === selected) : null

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(320px,420px)_1fr]">
      {/* Lista */}
      <div className={cn(
        'flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]',
        selected ? 'hidden lg:flex' : 'flex',
      )}>
        {/* Toolbar */}
        <div className="space-y-2 border-b border-[var(--color-border)] p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <Input
              placeholder="Buscar cliente…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[var(--color-ink-3)]">ABC:</span>
            {(['A', 'B', 'C'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFiltroABC(filtroABC === c ? null : c)}
                className={cn(
                  'rounded-md px-2 py-0.5 font-semibold',
                  filtroABC === c
                    ? abcBadgeActive(c)
                    : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
                )}
              >
                {c}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-[var(--color-ink-3)] tabular-nums">{filtrados.length} clientes</span>
          </div>
          <div className="flex gap-1">
            {PERIODOS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriodo(p.key)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                  periodo === p.key
                    ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                    : 'text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="max-h-[70vh] divide-y divide-[var(--color-border)] overflow-y-auto">
          {isLoading && (
            <div className="divide-y divide-[var(--color-border)]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <div className="h-5 w-5 animate-pulse rounded bg-[var(--color-surface-2)]" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-3/5 animate-pulse rounded bg-[var(--color-surface-2)]" />
                    <div className="h-2 w-2/5 animate-pulse rounded bg-[var(--color-surface-2)]" />
                  </div>
                  <div className="h-3 w-12 animate-pulse rounded bg-[var(--color-surface-2)]" />
                </div>
              ))}
            </div>
          )}
          {!isLoading && filtrados.length === 0 && <div className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">Sin resultados</div>}
          {filtrados.map(c => (
            <button
              key={c.contact_name_canon}
              type="button"
              onClick={() => setSelected(c.contact_name_canon)}
              className={cn(
                'grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2 text-left text-sm transition',
                selected === c.contact_name_canon ? 'bg-[var(--color-primary-soft)]' : 'hover:bg-[var(--color-surface-2)]',
              )}
            >
              <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold', abcBadge(c.clase))}>
                {c.clase}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[var(--color-ink)]">{c.contact_name_canon}</div>
                <div className="text-[10px] text-[var(--color-ink-3)] tabular-nums">
                  {c.docs}p · {eur(c.margen)} margen{c.pendiente > 0 ? ` · ${eur(c.pendiente)} pdte` : ''}
                </div>
              </div>
              <span className="text-xs font-medium tabular-nums text-[var(--color-ink-2)]">{eur(c.ventas)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ficha */}
      <div className={cn(selected ? 'block' : 'hidden lg:block')}>
        {clienteSel
          ? <Ficha cliente={clienteSel} from={range.from} to={range.to} onClose={() => setSelected(null)} />
          : (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-8 text-center text-sm text-[var(--color-ink-3)]">
              Selecciona un cliente a la izquierda para ver su ficha completa.
            </div>
          )}
      </div>
    </div>
  )
}

// ── Ficha ────────────────────────────────────────────────────────────────────

function Ficha({ cliente, from, to, onClose }: { cliente: ClienteABC; from: string; to: string; onClose: () => void }) {
  const { data: facturas = [] } = useClienteFacturas(cliente.contact_name_canon, from, to)
  const { data: productos = [] } = useClienteProductos(cliente.contact_name_canon, from, to, 30)

  return (
    <div className="space-y-3">
      {/* Cabecera */}
      <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] lg:hidden"
          aria-label="Volver"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold', abcBadge(cliente.clase))}>
              {cliente.clase}
            </span>
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)] md:text-xl">{cliente.contact_name_canon}</h2>
          </div>
          {cliente.num_aliases > 0 && (
            <div className="mt-0.5 text-[11px] text-[var(--color-ink-3)]">{cliente.num_aliases} alias{cliente.num_aliases === 1 ? '' : 'es'} unificado{cliente.num_aliases === 1 ? '' : 's'}</div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Documentos" value={cliente.docs.toString()} />
        <Kpi label="Ventas" value={euros(cliente.ventas)} tone="primary" />
        <Kpi label="Margen" value={euros(cliente.margen)} hint={cliente.margen_pct == null ? undefined : `${cliente.margen_pct.toFixed(0)}%`} tone="ok" />
        <Kpi label="Pendiente" value={cliente.pendiente > 0 ? euros(cliente.pendiente) : '—'} tone={cliente.pendiente > 0 ? 'warn' : 'muted'} />
        <Kpi label="Última" value={cliente.ultima_compra ? format(parseISO(cliente.ultima_compra), 'd LLL', { locale: es }) : '—'} />
      </div>

      {/* Top productos + Facturas en grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
            Top productos
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {productos.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">Sin productos en el rango</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-2)]">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                    <th className="px-3 py-1.5">Producto</th>
                    <th className="px-3 py-1.5 text-right">Veces</th>
                    <th className="px-3 py-1.5 text-right">Ventas</th>
                    <th className="px-3 py-1.5 text-right">% margen</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.product_id ?? p.nombre} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-1.5 truncate text-[var(--color-ink)]">{p.nombre}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{p.veces}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{eur(p.ventas_subtotal)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-ink-3)]">
                        {p.margen_pct == null ? '—' : `${p.margen_pct.toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
            Facturas / albaranes
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {facturas.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">Sin facturas en el rango</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-2)]">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                    <th className="px-3 py-1.5">Fecha</th>
                    <th className="px-3 py-1.5">Doc</th>
                    <th className="px-3 py-1.5 text-right">Total</th>
                    <th className="px-3 py-1.5 text-right">Pdte</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map(f => (
                    <tr key={f.id} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-1.5 text-[var(--color-ink-2)] tabular-nums">{format(parseISO(f.fecha), 'd LLL yy', { locale: es })}</td>
                      <td className="px-3 py-1.5 truncate text-[var(--color-ink-3)]">{f.doc_number ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-ink)]">{eur(f.total)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{f.payments_pending > 0 ? <span className="text-red-700">{eur(f.payments_pending)}</span> : <span className="text-[var(--color-ink-3)]">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Preferencias operativas (editable) */}
      <PreferenciasCard name={cliente.contact_name_canon} />

      {/* Notas internas + Aliases */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <NotasCard name={cliente.contact_name_canon} />
        <AliasesCard canon={cliente.contact_name_canon} />
      </div>

      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-center text-xs text-[var(--color-ink-3)]">
        Pendiente sesión 2: gráficos evolución mensual · heatmap individual cliente×día · márgenes detallados.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Kpi({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'primary' | 'ok' | 'warn' | 'muted' }) {
  const cls =
    tone === 'primary' ? 'text-[var(--color-primary-2)]' :
    tone === 'ok'      ? 'text-[#047857]' :
    tone === 'warn'    ? 'text-[#dc2626]' :
    tone === 'muted'   ? 'text-[var(--color-ink-3)]' :
                         'text-[var(--color-ink)]'
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</div>
      <div className={cn('mt-0.5 font-display text-base font-bold tabular-nums md:text-lg', cls)}>{value}</div>
      {hint && <div className="text-[10px] text-[var(--color-ink-3)]">{hint}</div>}
    </div>
  )
}

function abcBadge(c: 'A' | 'B' | 'C'): string {
  if (c === 'A') return 'bg-[#10b98122] text-[#047857]'
  if (c === 'B') return 'bg-[#f59e0b22] text-[#92400e]'
  return 'bg-[var(--color-surface-2)] text-[var(--color-ink-3)]'
}
function abcBadgeActive(c: 'A' | 'B' | 'C'): string {
  if (c === 'A') return 'bg-[#10b981] text-white'
  if (c === 'B') return 'bg-[#f59e0b] text-white'
  return 'bg-[var(--color-ink-2)] text-white'
}
