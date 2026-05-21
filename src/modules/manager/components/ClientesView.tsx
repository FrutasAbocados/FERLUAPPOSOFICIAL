import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Search } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { eurosShort } from '@/shared/lib/format'
import {
  type ClienteABCClase,
  type ClientePrograma,
  type ClienteSegmentacion,
  segmentarClientes,
} from '@/shared/lib/clientes-segmentacion'
import type { Period } from '../lib/period'
import type { ClienteListItem } from '../lib/types'
import { useClientesLista } from '../lib/queries'
import { ClienteDetalleModal } from './ClienteDetalleModal'

type SortKey = 'ventas' | 'margen' | 'docs' | 'pendiente'
type ClaseFilter = ClienteABCClase | 'all'
type ProgramaFilter = ClientePrograma | 'all'

type ClienteConSegmento = ClienteListItem & ClienteSegmentacion

const CLASE_BADGE: Record<ClienteABCClase, string> = {
  A: 'bg-[var(--mint-glow)] text-[var(--mint)] ring-1 ring-[oklch(72%_.14_156_/_0.35)]',
  B: 'bg-[oklch(93%_.06_220_/_0.75)] text-[oklch(39%_.11_224)] ring-1 ring-[oklch(78%_.11_224_/_0.45)] dark:bg-[oklch(30%_.08_224_/_0.42)] dark:text-[oklch(76%_.12_224)]',
  C: 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)] ring-1 ring-[var(--color-border)]',
}

const PROGRAMA_BADGE: Record<ClientePrograma, string> = {
  vip:      'bg-[var(--mint-glow)] text-[var(--mint)] ring-1 ring-[oklch(72%_.14_156_/_0.35)]',
  a:        'bg-[oklch(28%_.12_235_/_0.22)] text-[oklch(76%_.12_235)] ring-1 ring-[oklch(76%_.12_235_/_0.35)]',
  b:        'bg-[var(--color-warn-soft)] text-[var(--amber)] ring-1 ring-[oklch(80%_.15_75_/_0.45)]',
  c:        'bg-[var(--color-surface-2)] text-[var(--color-ink-2)] ring-1 ring-[var(--color-border)]',
  atencion: 'bg-[var(--coral-glow)] text-[var(--coral)] ring-1 ring-[oklch(70%_.18_28_/_0.45)]',
}

const PROGRAMAS: Array<{ key: ProgramaFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'atencion', label: 'Atención' },
  { key: 'vip', label: 'VIP' },
  { key: 'a', label: 'Clase A' },
  { key: 'b', label: 'Clase B' },
  { key: 'c', label: 'Clase C' },
]

const eur0 = eurosShort
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

interface Props {
  period: Period
}

export function ClientesView({ period }: Props) {
  const { data, isLoading } = useClientesLista(period)
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('ventas')
  const [claseFilter, setClaseFilter] = useState<ClaseFilter>('all')
  const [programaFilter, setProgramaFilter] = useState<ProgramaFilter>('all')
  const [selected, setSelected] = useState<ClienteConSegmento | null>(null)

  const conSegmento = useMemo<ClienteConSegmento[]>(() => {
    return segmentarClientes(data ?? [])
  }, [data])

  const filtered = useMemo(() => {
    let rows = conSegmento
    const qq = q.trim().toLowerCase()
    if (qq) rows = rows.filter(r => r.contact_name_canon.toLowerCase().includes(qq))
    if (claseFilter !== 'all') rows = rows.filter(r => r.clase === claseFilter)
    if (programaFilter !== 'all') rows = rows.filter(r => r.programa === programaFilter)
    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'ventas': return b.ventas - a.ventas
        case 'margen': return b.margen - a.margen
        case 'docs': return b.docs - a.docs
        case 'pendiente': return b.pendiente_cobro - a.pendiente_cobro
      }
    })
    return rows
  }, [conSegmento, q, sortKey, claseFilter, programaFilter])

  const counts = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 }
    for (const r of conSegmento) c[r.clase]++
    return c
  }, [conSegmento])

  const programaCounts = useMemo(() => {
    const c: Record<ClientePrograma, number> = { vip: 0, a: 0, b: 0, c: 0, atencion: 0 }
    for (const r of conSegmento) c[r.programa]++
    return c
  }, [conSegmento])

  return (
    <div className="space-y-3">
      <div className="ao-panel flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
          <Input
            placeholder="Buscar cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <div className="-mx-3 flex items-center gap-1 overflow-x-auto px-3 no-scrollbar md:mx-0 md:px-0">
          <span className="shrink-0 text-xs text-[var(--color-ink-3)]">Ordenar:</span>
          {([
            { k: 'ventas', l: 'Ventas' },
            { k: 'margen', l: 'Margen €' },
            { k: 'docs', l: 'Docs' },
            { k: 'pendiente', l: 'Pendiente' },
          ] as Array<{ k: SortKey; l: string }>).map(o => (
            <Button
              key={o.k}
              size="sm"
              variant={sortKey === o.k ? 'primary' : 'outline'}
              onClick={() => setSortKey(o.k)}
              className="shrink-0"
            >{o.l}</Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-[var(--color-ink-3)] tabular-nums">{filtered.length} clientes</span>
      </div>

      <div className="ao-card px-3 py-2">
        <div className="mb-1 text-xs text-[var(--color-ink-3)]">Clase ABC y programa comercial</div>
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 no-scrollbar">
          <Button size="sm" variant={claseFilter === 'all' ? 'primary' : 'outline'} onClick={() => setClaseFilter('all')} className="shrink-0">Todos</Button>
          <Button size="sm" variant={claseFilter === 'A' ? 'primary' : 'outline'} onClick={() => setClaseFilter('A')} className="shrink-0">
            A · top 70% <span className="ml-1 opacity-70">({counts.A})</span>
          </Button>
          <Button size="sm" variant={claseFilter === 'B' ? 'primary' : 'outline'} onClick={() => setClaseFilter('B')} className="shrink-0">
            B · 70-90% <span className="ml-1 opacity-70">({counts.B})</span>
          </Button>
          <Button size="sm" variant={claseFilter === 'C' ? 'primary' : 'outline'} onClick={() => setClaseFilter('C')} className="shrink-0">
            C · resto <span className="ml-1 opacity-70">({counts.C})</span>
          </Button>
        </div>
        <div className="-mx-1 mt-2 flex items-center gap-1.5 overflow-x-auto px-1 no-scrollbar">
          {PROGRAMAS.map(p => (
            <Button
              key={p.key}
              size="sm"
              variant={programaFilter === p.key ? 'primary' : 'outline'}
              onClick={() => setProgramaFilter(p.key)}
              className="shrink-0"
            >
              {p.label}
              {p.key !== 'all' && <span className="ml-1 opacity-70">({programaCounts[p.key]})</span>}
            </Button>
          ))}
        </div>
      </div>

      <div className="ao-card overflow-hidden p-0">
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {!isLoading && filtered.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin clientes en este periodo</p>}

        <div className="hidden md:grid md:grid-cols-[36px_1fr_120px_repeat(5,_84px)_60px] md:gap-2 md:border-b md:border-[var(--color-border)] md:px-4 md:py-2 md:text-xs md:font-semibold md:uppercase md:tracking-wider md:text-[var(--color-ink-3)]">
          <div>ABC</div>
          <div>Cliente</div>
          <div>Programa</div>
          <div className="text-right">Docs</div>
          <div className="text-right">Ventas</div>
          <div className="text-right">Margen €</div>
          <div className="text-right">% margen</div>
          <div className="text-right">Pendiente</div>
          <div className="text-right">Última</div>
        </div>

        <ul className="divide-y divide-[var(--color-border)]">
          {filtered.map(c => (
            <li key={c.contact_name_canon}>
              <button
                onClick={() => setSelected(c)}
                className="grid w-full grid-cols-[1fr_auto] gap-2 px-4 py-2 text-left text-sm transition hover:bg-[var(--color-surface-2,#f8fafc)] md:grid-cols-[36px_1fr_120px_repeat(5,_84px)_60px]"
              >
                <div className="hidden md:flex md:items-center">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${CLASE_BADGE[c.clase]}`}>
                    {c.clase}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`md:hidden inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${CLASE_BADGE[c.clase]}`}>{c.clase}</span>
                    <span className="truncate text-[var(--color-ink)]">{c.contact_name_canon}</span>
                  </div>
                  {c.num_aliases > 1 && (
                    <div className="text-xs text-[var(--color-ink-3)]">{c.num_aliases} nombres unificados</div>
                  )}
                  <div className="mt-1 flex items-center gap-1 md:hidden">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${PROGRAMA_BADGE[c.programa]}`}>{c.programaLabel}</span>
                    <span className="text-[10px] text-[var(--color-ink-3)]">{c.accionSugerida}</span>
                  </div>
                </div>
                <div className="hidden min-w-0 md:block">
                  <span className={`inline-flex max-w-full rounded-full px-2 py-0.5 text-[11px] font-semibold ${PROGRAMA_BADGE[c.programa]}`}>
                    <span className="truncate">{c.programaLabel}</span>
                  </span>
                  <div className="mt-0.5 truncate text-[10px] text-[var(--color-ink-3)]">{c.accionSugerida}</div>
                </div>
                <div className="hidden text-right text-sm tabular-nums text-[var(--color-ink)] md:block">{c.docs}</div>
                <div className="hidden text-right tabular-nums text-[var(--color-ink)] md:block">{eur0(c.ventas)}</div>
                <div className="hidden text-right tabular-nums text-[var(--mint)] md:block">{eur0(c.margen)}</div>
                <div className="hidden text-right tabular-nums text-[var(--color-ink-3)] md:block">{c.margen_pct == null ? '—' : `${c.margen_pct.toFixed(0)}%`}</div>
                <div className="hidden text-right tabular-nums text-[var(--color-primary)] md:block">{c.pendiente_cobro > 0 ? eur0(c.pendiente_cobro) : '—'}</div>
                <div className="hidden text-right text-xs text-[var(--color-ink-3)] md:block">{fmt(c.ultima_compra)}</div>

                {/* Mobile compact view */}
                <div className="text-right tabular-nums md:hidden">
                  <div className="text-[var(--color-ink)]">{eur0(c.ventas)}</div>
                  <div className="text-xs text-[var(--mint)]">{eur0(c.margen)} {c.margen_pct == null ? '' : `(${c.margen_pct.toFixed(0)}%)`}</div>
                  <div className="text-[10px] text-[var(--color-ink-3)]">{c.docs} docs · {fmt(c.ultima_compra)}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <ClienteDetalleModal cliente={selected} period={period} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
