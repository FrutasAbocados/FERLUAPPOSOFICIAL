import { useMemo, useState } from 'react'
import { format, endOfMonth, startOfMonth, subMonths } from 'date-fns'
import { Search } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { eurosShort } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { type ClientePrograma, segmentarClientes } from '@/shared/lib/clientes-segmentacion'
import { type ClienteABC, useClientesBBDD, useClientesSeguimiento } from '../lib/hooks'
import { ProgramaFidelizacionCard } from './ProgramaFidelizacionCard'

// ── Config visual por programa ─────────────────────────────────────────────────

const PROG_CFG: Record<ClientePrograma, { label: string; icon: string; accent: string; barBg: string; chipBg: string }> = {
  vip:      { label: 'VIP',      icon: '⭐', accent: 'var(--mint)',     barBg: 'oklch(38% .10 158 / .7)',  chipBg: 'oklch(38% .10 158 / .28)' },
  a:        { label: 'Clase A',  icon: '✓',  accent: 'var(--sky)',      barBg: 'oklch(28% .12 235 / .7)',  chipBg: 'oklch(28% .12 235 / .22)' },
  b:        { label: 'Clase B',  icon: '📈', accent: 'var(--amber)',    barBg: 'oklch(30% .12 70 / .7)',   chipBg: 'oklch(30% .12 70 / .28)' },
  c:        { label: 'Clase C',  icon: '·',  accent: 'var(--ink-dim)',  barBg: 'rgba(255,255,255,.12)',    chipBg: 'rgba(255,255,255,.06)' },
  atencion: { label: 'Atención', icon: '⚡', accent: 'var(--coral)',    barBg: 'oklch(28% .14 25 / .7)',   chipBg: 'oklch(28% .14 25 / .28)' },
}

const PROG_ORDER: Record<ClientePrograma, number> = { atencion: 0, vip: 1, a: 2, b: 3, c: 4 }
const FILTER_KEYS: Array<ClientePrograma | 'all'> = ['all', 'atencion', 'vip', 'a', 'b', 'c']

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
  const [filtro, setFiltro] = useState<ClientePrograma | 'all'>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const { data: clientesBase = [], isLoading, error } = useClientesBBDD(range.from, range.to)
  const { data: seguimiento = [] } = useClientesSeguimiento(7, 90)

  const clientes = useMemo(() => {
    const seg = new Map(seguimiento.map((s) => [s.contact_name_canon, s]))
    return segmentarClientes(clientesBase.map((c) => {
      const s = seg.get(c.contact_name_canon)
      return { ...c, dias_sin_pedir: s?.dias_sin_pedir ?? null, cadencia_dias: s?.cadencia_dias ?? null }
    })) as ClienteABC[]
  }, [clientesBase, seguimiento])

  const counts = useMemo(() => {
    const out: Record<ClientePrograma, number> = { vip: 0, a: 0, b: 0, c: 0, atencion: 0 }
    for (const c of clientes) out[c.programa]++
    return out
  }, [clientes])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return clientes
      .filter((c) => filtro === 'all' || c.programa === filtro)
      .filter((c) => !needle || c.contact_name_canon.toLowerCase().includes(needle))
      .sort((a, b) => PROG_ORDER[a.programa] - PROG_ORDER[b.programa] || b.loyaltyScore - a.loyaltyScore || b.margen - a.margen)
  }, [clientes, filtro, q])

  const selectedInRows = selected ? rows.find((r) => r.contact_name_canon === selected) ?? null : null
  const clienteSel = selectedInRows ?? rows[0] ?? null

  return (
    <div className="space-y-3">

      {/* ── Chips de programa ── */}
      <div className="flex flex-wrap gap-2">
        {FILTER_KEYS.map((key) => {
          const isAll = key === 'all'
          const count = isAll ? clientes.length : counts[key as ClientePrograma]
          const cfg = isAll ? null : PROG_CFG[key as ClientePrograma]
          const active = filtro === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFiltro(key)}
              className="flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 text-xs font-semibold transition-all"
              style={{
                background: active
                  ? (cfg ? cfg.chipBg : 'rgba(255,255,255,.08)')
                  : 'rgba(255,255,255,.03)',
                color: active
                  ? (cfg ? cfg.accent : 'var(--ink)')
                  : 'var(--ink-mute)',
                border: active
                  ? `1px solid ${cfg ? cfg.accent : 'var(--line-2)'}`
                  : '1px solid var(--line)',
                transform: active ? 'scale(1.03)' : 'scale(1)',
              }}
            >
              {cfg && <span className="text-[11px]">{cfg.icon}</span>}
              {isAll ? 'Todos' : cfg!.label}
              <span
                className="tabular-nums rounded-full px-1.5 py-0.5 text-[10px]"
                style={{ background: 'rgba(0,0,0,.25)' }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Búsqueda + rango ── */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-mute)' }} />
          <Input
            placeholder="Buscar cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: 'var(--ink-mute)' }}>Desde</span>
          <Input type="date" value={range.from} max={range.to}
            onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))}
            className="h-8 w-[130px] text-xs" />
          <span className="text-xs" style={{ color: 'var(--ink-mute)' }}>hasta</span>
          <Input type="date" value={range.to} min={range.from}
            onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))}
            className="h-8 w-[130px] text-xs" />
        </div>
      </div>

      {error && (
        <div className="ao-card p-3 text-sm" style={{ color: 'var(--coral)' }}>
          {error instanceof Error ? error.message : 'Error cargando programa'}
        </div>
      )}
      {isLoading && (
        <div className="ao-card p-8 text-center text-sm" style={{ color: 'var(--ink-mute)' }}>
          Cargando…
        </div>
      )}
      {!isLoading && rows.length === 0 && (
        <div className="ao-card p-8 text-center text-sm" style={{ color: 'var(--ink-mute)' }}>
          Sin clientes en este filtro
        </div>
      )}

      {/* ── Master-detail ── */}
      {!isLoading && rows.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,380px)_1fr]">

          {/* Lista */}
          <div
            className="overflow-y-auto rounded-[var(--radius-md)]"
            style={{
              maxHeight: '70vh',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
            }}
          >
            {rows.map((c) => {
              const cfg = PROG_CFG[c.programa]
              const active = clienteSel?.contact_name_canon === c.contact_name_canon
              return (
                <button
                  key={c.contact_name_canon}
                  type="button"
                  onClick={() => setSelected(c.contact_name_canon)}
                  className="relative flex w-full items-stretch gap-0 border-b text-left transition-colors last:border-b-0"
                  style={{
                    borderColor: 'var(--line)',
                    background: active ? 'oklch(38% .10 158 / .12)' : 'transparent',
                  }}
                >
                  {/* Accent bar */}
                  <div
                    className="w-[3px] shrink-0 transition-opacity"
                    style={{
                      background: cfg.barBg,
                      opacity: active ? 1 : 0.45,
                    }}
                  />
                  <div className="flex-1 px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px]">{cfg.icon}</span>
                      <span
                        className="truncate text-sm font-semibold"
                        style={{ color: active ? 'var(--ink)' : 'var(--ink-dim)' }}
                      >
                        {c.contact_name_canon}
                      </span>
                      <span
                        className={cn(
                          'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                        )}
                        style={{ background: cfg.chipBg, color: cfg.accent }}
                      >
                        {c.clase}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--ink-mute)' }}>
                      {c.accionSugerida}
                    </div>
                    <div className="mono mt-1 flex gap-2.5 text-[11px] tabular-nums" style={{ color: 'var(--ink-dim)' }}>
                      <span>{c.docs}p</span>
                      <span>{eurosShort(c.margen)} margen</span>
                      {c.pendiente > 0 && (
                        <span style={{ color: 'var(--coral)' }}>{eurosShort(c.pendiente)} pdte</span>
                      )}
                      <span className="ml-auto" style={{ color: cfg.accent }}>
                        {c.loyaltyScore}pts
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Detalle */}
          <div>
            {clienteSel ? (
              <div key={clienteSel.contact_name_canon} className="space-y-3" style={{ animation: 'fadeSlideIn .18s ease-out' }}>
                {/* Cabecera cliente */}
                <div
                  className="rounded-[var(--radius-md)] px-4 py-3"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                      style={{ background: PROG_CFG[clienteSel.programa].chipBg, color: PROG_CFG[clienteSel.programa].accent }}
                    >
                      {clienteSel.clase}
                    </span>
                    <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                      {clienteSel.contact_name_canon}
                    </h3>
                  </div>
                  <div className="mono mt-2 flex flex-wrap gap-4 text-xs tabular-nums" style={{ color: 'var(--ink-dim)' }}>
                    <span>{clienteSel.docs} pedidos</span>
                    <span>{eurosShort(clienteSel.ventas)} ventas</span>
                    <span>{eurosShort(clienteSel.margen)} margen</span>
                    <span>Score <strong style={{ color: PROG_CFG[clienteSel.programa].accent }}>{clienteSel.loyaltyScore}</strong>/100</span>
                  </div>
                </div>

                <ProgramaFidelizacionCard
                  cliente={{
                    ...clienteSel,
                    scoreBreakdown: clienteSel.scoreBreakdown,
                  }}
                />
              </div>
            ) : (
              <div
                className="flex h-40 items-center justify-center rounded-[var(--radius-md)] text-sm"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--ink-mute)' }}
              >
                Selecciona un cliente para editar su programa
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
