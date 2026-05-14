import { useEffect, useMemo, useState } from 'react'
import { format, endOfMonth, startOfMonth, subMonths } from 'date-fns'
import { Search } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { eurosShort } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { type ClientePrograma, segmentarClientes } from '@/shared/lib/clientes-segmentacion'
import { type ClienteABC, useClientesBBDD, useClientesSeguimiento } from '../lib/hooks'
import { ProgramaFidelizacionCard } from './ProgramaFidelizacionCard'

const PROGRAMAS: Array<{ key: ClientePrograma | 'all'; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'deuda', label: 'Deuda' },
  { key: 'riesgo', label: 'Riesgo' },
  { key: 'vip', label: 'VIP' },
  { key: 'potencial', label: 'Potencial' },
  { key: 'rentable', label: 'Rentable' },
  { key: 'estandar', label: 'Estandar' },
]

const PROGRAMA_ORDER: Record<ClientePrograma, number> = {
  deuda: 0,
  riesgo: 1,
  vip: 2,
  potencial: 3,
  rentable: 4,
  estandar: 5,
}

function defaultRange() {
  const today = new Date()
  return {
    from: format(startOfMonth(subMonths(today, 2)), 'yyyy-MM-dd'),
    to: format(endOfMonth(today), 'yyyy-MM-dd'),
  }
}

export function ProgramaFidelizacionView() {
  const [range, setRange] = useState(defaultRange)
  const [q, setQ] = useState('')
  const [programa, setPrograma] = useState<ClientePrograma | 'all'>('all')
  const [selected, setSelected] = useState<string | null>(null)
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

  const counts = useMemo(() => {
    const out: Record<ClientePrograma, number> = { vip: 0, riesgo: 0, deuda: 0, potencial: 0, rentable: 0, estandar: 0 }
    for (const c of clientes) out[c.programa]++
    return out
  }, [clientes])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return clientes
      .filter((c) => programa === 'all' || c.programa === programa)
      .filter((c) => !needle || c.contact_name_canon.toLowerCase().includes(needle))
      .sort((a, b) => PROGRAMA_ORDER[a.programa] - PROGRAMA_ORDER[b.programa] || b.loyaltyScore - a.loyaltyScore || b.margen - a.margen)
  }, [clientes, programa, q])

  useEffect(() => {
    if (rows.length === 0) {
      setSelected(null)
      return
    }
    if (!selected || !rows.some((row) => row.contact_name_canon === selected)) {
      setSelected(rows[0].contact_name_canon)
    }
  }, [rows, selected])

  const clienteSel = selected ? rows.find((row) => row.contact_name_canon === selected) : null

  return (
    <div className="space-y-3">
      <div className="ao-card space-y-3 p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <Input
              placeholder="Buscar cliente para editar programa..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
          <label className="space-y-1">
            <span className="label-caps block">Desde</span>
            <Input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
              className="h-9 text-xs"
            />
          </label>
          <label className="space-y-1">
            <span className="label-caps block">Hasta</span>
            <Input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
              className="h-9 text-xs"
            />
          </label>
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 no-scrollbar">
          {PROGRAMAS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPrograma(p.key)}
              className={cn(
                'shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold',
                programa === p.key
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
              )}
            >
              {p.label}{p.key !== 'all' ? ` · ${counts[p.key]}` : ` · ${clientes.length}`}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="ao-card p-3 text-sm text-[var(--coral)]">{error instanceof Error ? error.message : 'Error cargando programa'}</div>}
      {isLoading && <div className="ao-card p-6 text-center text-sm text-[var(--color-ink-3)]">Cargando programa...</div>}
      {!isLoading && rows.length === 0 && <div className="ao-card p-6 text-center text-sm text-[var(--color-ink-3)]">Sin clientes en este filtro</div>}

      <div className="grid gap-3 lg:grid-cols-[minmax(320px,440px)_1fr]">
        <div className="ao-card max-h-[72vh] overflow-y-auto p-0">
          {rows.map((cliente) => (
            <button
              key={cliente.contact_name_canon}
              type="button"
              onClick={() => setSelected(cliente.contact_name_canon)}
              className={cn(
                'block w-full border-b border-[var(--color-border)] px-3 py-2 text-left transition last:border-b-0',
                selected === cliente.contact_name_canon ? 'bg-[var(--color-primary-soft)]' : 'hover:bg-[rgba(255,255,255,.035)]',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold', abcBadge(cliente.clase))}>{cliente.clase}</span>
                <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold', programaBadge(cliente.programa))}>{cliente.programaLabel}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-ink)]">{cliente.contact_name_canon}</span>
              </div>
              <div className="mt-1 truncate text-xs text-[var(--color-ink-3)]">{cliente.accionSugerida}</div>
              <div className="mono mt-1 flex gap-3 text-xs tabular-nums text-[var(--color-ink-2)]">
                <span>{cliente.docs}p</span>
                <span>{eurosShort(cliente.margen)} margen</span>
                {cliente.pendiente > 0 && <span className="text-[var(--coral)]">{eurosShort(cliente.pendiente)} pdte</span>}
              </div>
            </button>
          ))}
        </div>

        <div>
          {clienteSel ? (
            <div className="space-y-3">
              <div className="ao-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold', abcBadge(clienteSel.clase))}>{clienteSel.clase}</span>
                  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', programaBadge(clienteSel.programa))}>{clienteSel.programaLabel}</span>
                  <h3 className="text-base font-semibold text-[var(--color-ink)]">{clienteSel.contact_name_canon}</h3>
                </div>
                <div className="mono mt-2 flex flex-wrap gap-4 text-xs tabular-nums text-[var(--color-ink-2)]">
                  <span>{clienteSel.docs} pedidos</span>
                  <span>{eurosShort(clienteSel.ventas)} ventas</span>
                  <span>{eurosShort(clienteSel.margen)} margen</span>
                  <span>Score {clienteSel.loyaltyScore}/100</span>
                </div>
              </div>
              <ProgramaFidelizacionCard cliente={clienteSel} />
            </div>
          ) : (
            <div className="ao-card p-6 text-center text-sm text-[var(--color-ink-3)]">Selecciona un cliente para editar su programa.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function abcBadge(c: 'A' | 'B' | 'C'): string {
  if (c === 'A') return 'bg-[var(--mint-glow)] text-[var(--mint)]'
  if (c === 'B') return 'bg-[var(--color-warn-soft)] text-[var(--amber)]'
  return 'bg-[var(--color-surface-2)] text-[var(--color-ink-3)]'
}

function programaBadge(p: ClientePrograma): string {
  if (p === 'vip') return 'bg-[var(--mint-glow)] text-[var(--mint)]'
  if (p === 'riesgo') return 'bg-[var(--color-warn-soft)] text-[var(--amber)]'
  if (p === 'deuda') return 'bg-[var(--coral-glow)] text-[var(--coral)]'
  if (p === 'potencial') return 'bg-[oklch(93%_.06_220_/_0.75)] text-[oklch(39%_.11_224)] dark:bg-[oklch(30%_.08_224_/_0.42)] dark:text-[oklch(76%_.12_224)]'
  if (p === 'rentable') return 'bg-[var(--color-surface-2)] text-[var(--mint)]'
  return 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)]'
}
