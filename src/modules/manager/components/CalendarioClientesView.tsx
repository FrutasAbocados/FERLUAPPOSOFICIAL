import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { eachDayOfInterval, format, getDay, isSameDay, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Users, X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { supabase } from '@/shared/lib/supabase'
import { euros, eurosShort } from '@/shared/lib/format'
import type { Period } from '../lib/period'

interface DiaCliente {
  fecha: string
  num_clientes: number
  num_docs: number
  total: number
  clientes: Array<{ nombre: string; total: number; docs: number }>
}

const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const eur = eurosShort
const eur2 = euros

function useClientesPorDia(period: Period) {
  return useQuery({
    queryKey: ['manager', 'clientesPorDia', period.from, period.to] as const,
    queryFn: async (): Promise<DiaCliente[]> => {
      const { data, error } = await supabase.rpc('manager_clientes_por_dia', { p_from: period.from, p_to: period.to })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        fecha:        String(r.fecha),
        num_clientes: Number(r.num_clientes ?? 0),
        num_docs:     Number(r.num_docs ?? 0),
        total:        Number(r.total ?? 0),
        clientes:     (r.clientes as DiaCliente['clientes']) ?? [],
      }))
    },
  })
}

interface Props {
  period: Period
}

export function CalendarioClientesView({ period }: Props) {
  const { data, isLoading } = useClientesPorDia(period)
  const [selectedDay, setSelectedDay] = useState<DiaCliente | null>(null)

  const days = useMemo(() => {
    if (!period.from || !period.to) return []
    return eachDayOfInterval({ start: parseISO(period.from), end: parseISO(period.to) })
  }, [period.from, period.to])

  const byDate = useMemo(() => {
    const m = new Map<string, DiaCliente>()
    for (const d of data ?? []) m.set(d.fecha, d)
    return m
  }, [data])

  const maxClientes = Math.max(1, ...(data ?? []).map(d => d.num_clientes))

  const totales = useMemo(() => {
    const dias_con_actividad = (data ?? []).filter(d => d.num_clientes > 0).length
    const total_eur = (data ?? []).reduce((s, d) => s + d.total, 0)
    const max_dia = (data ?? []).reduce((max, d) => d.num_clientes > max.num_clientes ? d : max, { fecha: '', num_clientes: 0, num_docs: 0, total: 0, clientes: [] } as DiaCliente)
    return { dias_con_actividad, total_eur, max_dia }
  }, [data])

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Días con actividad" value={String(totales.dias_con_actividad)} />
        <Tile label="Días del periodo" value={String(days.length)} />
        <Tile label="Total ventas" value={eur(totales.total_eur)} tone="positive" />
        <Tile label="Día con más clientes" value={totales.max_dia.num_clientes > 0 ? `${totales.max_dia.num_clientes}` : '—'} sub={totales.max_dia.fecha ? format(parseISO(totales.max_dia.fecha), "d LLL", { locale: es }) : ''} />
      </div>

      {/* Calendario */}
      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
      {data && (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-surface-2,#f3f4ee)]">
            {DOW_LABELS.map(d => (
              <div key={d} className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {(() => {
              const firstDay = days[0]
              if (!firstDay) return null
              const dow = (getDay(firstDay) + 6) % 7
              return Array.from({ length: dow }, (_, i) => (
                <div key={`pad-${i}`} className="border-b border-r border-[var(--color-border)]/40 bg-[var(--color-surface-2,#f8fafc)]" />
              ))
            })()}
            {days.map(d => {
              const iso = format(d, 'yyyy-MM-dd')
              const dia = byDate.get(iso)
              const isHoy = isSameDay(d, new Date())
              const isDom = getDay(d) === 0
              const intensity = dia ? dia.num_clientes / maxClientes : 0
              const tieneActividad = dia && dia.num_clientes > 0
              return (
                <button
                  key={iso}
                  disabled={!tieneActividad}
                  onClick={() => dia && setSelectedDay(dia)}
                  className={`relative flex min-h-[84px] flex-col gap-1 border-b border-r border-[var(--color-border)]/40 p-2 text-left transition ${
                    tieneActividad ? 'hover:bg-[var(--color-surface-2,#f8fafc)]' : 'cursor-default opacity-50'
                  } ${isHoy ? 'ring-2 ring-inset ring-[var(--color-primary)]' : ''}`}
                  style={tieneActividad ? { backgroundColor: `rgba(59, 130, 246, ${0.05 + intensity * 0.30})` } : undefined}
                >
                  <div className="flex items-baseline justify-between">
                    <span className={`text-sm font-semibold ${isHoy ? 'text-[var(--color-primary)]' : isDom ? 'text-[var(--color-ink-3)]' : 'text-[var(--color-ink)]'}`}>
                      {format(d, 'd')}
                    </span>
                  </div>
                  {tieneActividad ? (
                    <div className="space-y-0.5 text-[10px] leading-tight">
                      <div className="flex items-center gap-1 text-[var(--color-ink)]">
                        <Users className="h-3 w-3" />
                        <span className="font-bold">{dia!.num_clientes}</span>
                        <span className="text-[var(--color-ink-3)]">clientes</span>
                      </div>
                      <div className="font-medium tabular-nums text-[var(--color-ink)]">{eur(dia!.total)}</div>
                      <div className="text-[var(--color-ink-3)]">{dia!.num_docs} docs</div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-[var(--color-ink-3)]">—</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selectedDay && <ModalDia dia={selectedDay} onClose={() => setSelectedDay(null)} />}
    </div>
  )
}

function ModalDia({ dia, onClose }: { dia: DiaCliente; onClose: () => void }) {
  return (
    <Modal onClose={onClose} size="xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Clientes que pidieron</p>
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">{format(parseISO(dia.fecha), "EEEE d 'de' LLLL", { locale: es })}</h2>
            <p className="mt-0.5 text-xs text-[var(--color-ink-3)]">
              {dia.num_clientes} clientes · {dia.num_docs} docs · <span className="font-medium text-[var(--mint)]">{eur2(dia.total)}</span>
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <ul className="divide-y divide-[var(--color-border)]">
          {dia.clientes.map((c, i) => (
            <li key={c.nombre} className="grid grid-cols-[24px_1fr_auto_auto] items-baseline gap-3 px-5 py-2 text-sm">
              <span className="text-xs tabular-nums text-[var(--color-ink-3)]">{i + 1}</span>
              <span className="truncate text-[var(--color-ink)]">{c.nombre}</span>
              <span className="text-xs text-[var(--color-ink-3)]">{c.docs} docs</span>
              <span className="font-medium tabular-nums text-[var(--color-ink)]">{eur2(c.total)}</span>
            </li>
          ))}
        </ul>
    </Modal>
  )
}

function Tile({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: 'positive' | 'neutral' }) {
  return (
    <div className="ao-card px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</div>
      <div className={`mt-1 font-display text-xl font-bold ${tone === 'positive' ? 'text-[var(--mint)]' : 'text-[var(--color-ink)]'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-[var(--color-ink-3)]">{sub}</div>}
    </div>
  )
}
