import { useMemo, useState } from 'react'
import { ChevronLeft, Search, X } from 'lucide-react'
import { format, parseISO, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Input } from '@/shared/components/ui/input'
import { euros, eurosShort } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { type ClientePrograma, segmentarClientes } from '@/shared/lib/clientes-segmentacion'
import {
  type ClienteABC,
  useClienteFacturas,
  useClienteProductos,
  useClientesBBDD,
  useClientesSeguimiento,
} from '../lib/hooks'
import { PreferenciasCard } from './PreferenciasCard'
import { ProgramaFidelizacionCard } from './ProgramaFidelizacionCard'
import { NotasCard } from './NotasCard'
import { AliasesCard } from './AliasesCard'
import { EvolucionChart } from './EvolucionChart'
import { HeatmapDiaCalendario } from './HeatmapDiaCalendario'
import { MargenesDetalle } from './MargenesDetalle'

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
type ProgramaFilter = ClientePrograma | null

function rangoFor(p: Periodo): { from: string; to: string } {
  const today = new Date()
  if (p === '3m')  return { from: format(startOfMonth(subMonths(today, 2)),  'yyyy-MM-dd'), to: format(endOfMonth(today), 'yyyy-MM-dd') }
  if (p === '6m')  return { from: format(startOfMonth(subMonths(today, 5)),  'yyyy-MM-dd'), to: format(endOfMonth(today), 'yyyy-MM-dd') }
  if (p === '12m') return { from: format(startOfMonth(subMonths(today, 11)), 'yyyy-MM-dd'), to: format(endOfMonth(today), 'yyyy-MM-dd') }
  return { from: `${today.getFullYear()}-01-01`, to: format(endOfMonth(today), 'yyyy-MM-dd') }
}

const eur = eurosShort

const PROGRAMAS: Array<{ key: ProgramaFilter; label: string }> = [
  { key: null, label: 'Todos' },
  { key: 'vip', label: 'VIP' },
  { key: 'riesgo', label: 'Riesgo' },
  { key: 'deuda', label: 'Deuda' },
  { key: 'potencial', label: 'Potencial' },
]

export function BBDDView({ selected: selectedExt, onSelectChange }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('3m')
  const [q, setQ] = useState('')
  const [filtroABC, setFiltroABC] = useState<'A' | 'B' | 'C' | null>(null)
  const [filtroPrograma, setFiltroPrograma] = useState<ProgramaFilter>(null)
  const [selectedInt, setSelectedInt] = useState<string | null>(null)

  const selected = selectedExt ?? selectedInt
  const setSelected = (n: string | null) => {
    setSelectedInt(n)
    onSelectChange?.(n)
  }

  const range = rangoFor(periodo)
  const { data: clientesBase = [], isLoading, error } = useClientesBBDD(range.from, range.to)
  const { data: seguimiento = [] } = useClientesSeguimiento(7, 90)

  const clientes = useMemo(() => {
    const seg = new Map(seguimiento.map((s) => [s.contact_name_canon, s]))
    return segmentarClientes(clientesBase.map((c) => {
      const s = seg.get(c.contact_name_canon)
      return {
        ...c,
        dias_sin_pedir: s?.dias_sin_pedir ?? null,
        cadencia_dias: s?.cadencia_dias ?? null,
      }
    })) as ClienteABC[]
  }, [clientesBase, seguimiento])

  const filtrados = useMemo(() => {
    let rows = clientes
    if (q.trim()) rows = rows.filter(c => c.contact_name_canon.toLowerCase().includes(q.trim().toLowerCase()))
    if (filtroABC) rows = rows.filter(c => c.clase === filtroABC)
    if (filtroPrograma) rows = rows.filter(c => c.programa === filtroPrograma)
    return rows
  }, [clientes, q, filtroABC, filtroPrograma])

  const programaCounts = useMemo(() => {
    const c: Record<ClientePrograma, number> = { vip: 0, riesgo: 0, deuda: 0, potencial: 0, rentable: 0, estandar: 0 }
    for (const row of clientes) c[row.programa]++
    return c
  }, [clientes])

  const clienteSel = selected ? clientes.find(c => c.contact_name_canon === selected) : null

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(320px,420px)_1fr]">
      {/* Lista */}
      <div className={cn(
        'ao-card flex flex-col overflow-hidden p-0',
        selected ? 'hidden lg:flex' : 'flex',
      )}>
        {/* Toolbar */}
        <div className="space-y-2 border-b border-[var(--color-border)] p-3">
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
                    : 'text-[var(--color-ink-2)] hover:bg-[rgba(255,255,255,.035)]',
                )}
              >
                {c}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-[var(--color-ink-3)] tabular-nums">{filtrados.length} clientes</span>
          </div>
          <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 text-xs no-scrollbar">
            <span className="shrink-0 text-[var(--color-ink-3)]">Programa:</span>
            {PROGRAMAS.map((p) => (
              <button
                key={p.key ?? 'all'}
                type="button"
                onClick={() => setFiltroPrograma(p.key)}
                className={cn(
                  'shrink-0 rounded-md px-2 py-0.5 font-semibold',
                  filtroPrograma === p.key
                    ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                    : 'text-[var(--color-ink-2)] hover:bg-[rgba(255,255,255,.035)]',
                )}
              >
                {p.label}{p.key ? ` · ${programaCounts[p.key]}` : ''}
              </button>
            ))}
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
          {error && <div className="px-3 py-3 text-xs text-[var(--coral)]">{error instanceof Error ? error.message : 'Error cargando clientes'}</div>}
          {filtrados.map(c => (
            <button
              key={c.contact_name_canon}
              type="button"
              onClick={() => setSelected(c.contact_name_canon)}
              className={cn(
                'grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2 text-left text-sm transition',
                selected === c.contact_name_canon ? 'bg-[var(--color-primary-soft)]' : 'hover:bg-[rgba(255,255,255,.035)]',
              )}
            >
              <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold', abcBadge(c.clase))}>
                {c.clase}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[var(--color-ink)]">{c.contact_name_canon}</div>
                <div className="mono text-[10px] text-[var(--color-ink-3)] tabular-nums">
                  {c.docs}p · {eur(c.margen)} margen{c.pendiente > 0 ? ` · ${eur(c.pendiente)} pdte` : ''}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <span className={cn('inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold', programaBadge(c.programa))}>
                    {c.programaLabel}
                  </span>
                  <span className="truncate text-[9px] text-[var(--color-ink-3)]">{c.accionSugerida}</span>
                </div>
              </div>
              <span className="mono text-xs font-medium tabular-nums text-[var(--color-ink-2)]">{eur(c.ventas)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ficha */}
      <div className={cn(selected ? 'block' : 'hidden lg:block')}>
        {clienteSel
          ? <Ficha cliente={clienteSel} from={range.from} to={range.to} onClose={() => setSelected(null)} />
          : (
            <div className="ao-card flex h-full min-h-[200px] items-center justify-center border-dashed p-8 text-center text-sm text-[var(--color-ink-3)]">
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
      <div className="ao-card flex items-start gap-2 p-3">
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
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', programaBadge(cliente.programa))}>
              {cliente.programaLabel}
            </span>
            <h2 className="text-lg font-semibold text-[var(--color-ink)] md:text-xl">{cliente.contact_name_canon}</h2>
          </div>
          <div className="mt-1 text-xs text-[var(--color-ink-3)]">{cliente.accionSugerida} · Score {cliente.loyaltyScore}/100</div>
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
        <div className="ao-card overflow-hidden p-0">
          <div className="label-caps border-b border-[var(--color-border)] px-3 py-2">
            Top productos
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {productos.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">Sin productos en el rango</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[rgba(255,255,255,.025)]">
                  <tr className="label-caps text-left">
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
                      <td className="mono px-3 py-1.5 text-right tabular-nums">{eur(p.ventas_subtotal)}</td>
                      <td className="mono px-3 py-1.5 text-right tabular-nums text-[var(--color-ink-3)]">
                        {p.margen_pct == null ? '—' : `${p.margen_pct.toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="ao-card overflow-hidden p-0">
          <div className="label-caps border-b border-[var(--color-border)] px-3 py-2">
            Facturas / albaranes
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {facturas.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">Sin facturas en el rango</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[rgba(255,255,255,.025)]">
                  <tr className="label-caps text-left">
                    <th className="px-3 py-1.5">Fecha</th>
                    <th className="px-3 py-1.5">Doc</th>
                    <th className="px-3 py-1.5 text-right">Total</th>
                    <th className="px-3 py-1.5 text-right">Pdte</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map(f => (
                    <tr key={f.id} className="border-t border-[var(--color-border)]">
                      <td className="mono px-3 py-1.5 text-[var(--color-ink-2)] tabular-nums">{format(parseISO(f.fecha), 'd LLL yy', { locale: es })}</td>
                      <td className="px-3 py-1.5 truncate text-[var(--color-ink-3)]">{f.doc_number ?? '—'}</td>
                      <td className="mono px-3 py-1.5 text-right tabular-nums text-[var(--color-ink)]">{eur(f.total)}</td>
                      <td className="mono px-3 py-1.5 text-right tabular-nums">{f.payments_pending > 0 ? <span className="text-[var(--coral)]">{eur(f.payments_pending)}</span> : <span className="text-[var(--color-ink-3)]">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Evolución mensual + Calendario actividad (sesión 2) */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <EvolucionChart name={cliente.contact_name_canon} />
        <HeatmapDiaCalendario name={cliente.contact_name_canon} dias={90} />
      </div>

      {/* Márgenes detallados por producto vs media (sesión 2) */}
      <MargenesDetalle name={cliente.contact_name_canon} from={from} to={to} />

      {/* Preferencias operativas (editable) */}
      <ProgramaFidelizacionCard cliente={cliente} />
      <PreferenciasCard name={cliente.contact_name_canon} />

      {/* Notas internas + Aliases */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <NotasCard name={cliente.contact_name_canon} />
        <AliasesCard canon={cliente.contact_name_canon} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Kpi({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'primary' | 'ok' | 'warn' | 'muted' }) {
  const cls =
    tone === 'primary' ? 'text-[var(--mint)]' :
    tone === 'ok'      ? 'text-[var(--mint)]' :
    tone === 'warn'    ? 'text-[var(--coral)]' :
    tone === 'muted'   ? 'text-[var(--color-ink-3)]' :
                         'text-[var(--color-ink)]'
  return (
    <div className="ao-card p-2.5">
      <div className="label-caps">{label}</div>
      <div className={cn('mono mt-0.5 text-base font-semibold tabular-nums md:text-lg', cls)}>{value}</div>
      {hint && <div className="text-[10px] text-[var(--color-ink-3)]">{hint}</div>}
    </div>
  )
}

function abcBadge(c: 'A' | 'B' | 'C'): string {
  if (c === 'A') return 'bg-[var(--mint-glow)] text-[var(--mint)]'
  if (c === 'B') return 'bg-[var(--color-warn-soft)] text-[var(--amber)]'
  return 'bg-[var(--color-surface-2)] text-[var(--color-ink-3)]'
}
function abcBadgeActive(c: 'A' | 'B' | 'C'): string {
  if (c === 'A') return 'bg-[var(--mint)] text-[#06100d]'
  if (c === 'B') return 'bg-[var(--amber)] text-[#120d05]'
  return 'bg-[var(--color-ink-2)] text-[#06100d]'
}

function programaBadge(p: ClientePrograma): string {
  if (p === 'vip') return 'bg-[var(--mint-glow)] text-[var(--mint)]'
  if (p === 'riesgo') return 'bg-[var(--color-warn-soft)] text-[var(--amber)]'
  if (p === 'deuda') return 'bg-[var(--coral-glow)] text-[var(--coral)]'
  if (p === 'potencial') return 'bg-[oklch(93%_.06_220_/_0.75)] text-[oklch(39%_.11_224)] dark:bg-[oklch(30%_.08_224_/_0.42)] dark:text-[oklch(76%_.12_224)]'
  if (p === 'rentable') return 'bg-[var(--color-surface-2)] text-[var(--mint)]'
  return 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)]'
}
