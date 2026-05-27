import { useMemo } from 'react'
import { addDays, format, getDay, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { euros } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { useClienteHeatmap, type HeatmapDiaRow } from '../lib/hooks'

type Props = { name: string; dias?: number }

const DOW_LABEL = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function HeatmapDiaCalendario({ name, dias = 90 }: Props) {
  const today = useMemo(() => new Date(), [])
  const from = format(subDays(today, dias - 1), 'yyyy-MM-dd')
  const to   = format(today, 'yyyy-MM-dd')

  const { data: rows = [], isLoading } = useClienteHeatmap(name, from, to)

  const map = useMemo(() => {
    const m = new Map<string, HeatmapDiaRow>()
    for (const r of rows) m.set(r.fecha, r)
    return m
  }, [rows])

  const maxVentas = useMemo(() => Math.max(0, ...rows.map(r => r.ventas)), [rows])

  const grid = useMemo(() => {
    // Construye grid de 7 filas × N columnas (semanas). Lunes=0..Domingo=6
    const cols: { weekStart: Date; days: { date: Date; iso: string }[] }[] = []
    let cursor = subDays(today, dias - 1)
    // Alinea al lunes anterior
    const offset = (getDay(cursor) + 6) % 7
    cursor = subDays(cursor, offset)
    let week: { date: Date; iso: string }[] = []
    while (cursor <= today) {
      week.push({ date: cursor, iso: format(cursor, 'yyyy-MM-dd') })
      if (week.length === 7) {
        cols.push({ weekStart: week[0].date, days: week })
        week = []
      }
      cursor = addDays(cursor, 1)
    }
    if (week.length > 0) {
      while (week.length < 7) {
        week.push({ date: addDays(week[week.length - 1].date, 1), iso: '' })
      }
      cols.push({ weekStart: week[0].date, days: week })
    }
    return cols
  }, [dias, today])

  const total = rows.reduce((s, r) => s + r.ventas, 0)
  const dias_con_actividad = rows.length

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Calendario actividad <span className="text-[var(--color-ink-3)]">({dias} días)</span>
        </h3>
        <div className="text-[11px] text-[var(--color-ink-3)] tabular-nums">
          {dias_con_actividad} días con pedido · {euros(total)}
        </div>
      </div>
      <div className="p-3">
        {isLoading ? (
          <div className="h-32 animate-pulse rounded bg-[var(--color-surface-2)]" />
        ) : rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-[var(--color-ink-3)]">
            Sin pedidos en este rango
          </div>
        ) : (
          <div className="flex gap-1.5">
            {/* Etiquetas días de la semana (vertical) */}
            <div className="flex flex-col gap-1 pt-4 text-[9px] text-[var(--color-ink-3)]">
              {DOW_LABEL.map((d, i) => (
                <div key={d} className={cn('h-3 leading-3', i % 2 === 1 ? '' : 'opacity-0')}>{d}</div>
              ))}
            </div>
            {/* Grid columnas-semanas */}
            <div className="flex flex-1 gap-1 overflow-x-auto pb-1">
              {grid.map((col, i) => {
                const monthLabel = i === 0 || col.weekStart.getDate() <= 7
                  ? format(col.weekStart, 'LLL', { locale: es })
                  : ''
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="h-3 text-[9px] capitalize text-[var(--color-ink-3)]">{monthLabel}</div>
                    {col.days.map((d, j) => {
                      const data = map.get(d.iso)
                      const intensity = data && maxVentas > 0 ? data.ventas / maxVentas : 0
                      const future = d.date > today
                      return (
                        <div
                          key={j}
                          className={cn(
                            'h-3 w-3 rounded-[2px]',
                            future ? 'bg-transparent' : data ? '' : 'bg-[var(--color-surface-2)]',
                          )}
                          style={data ? { backgroundColor: intensityColor(intensity) } : undefined}
                          title={data ? `${format(d.date, "d 'de' LLL", { locale: es })} · ${data.pedidos}p · ${euros(data.ventas)}` : format(d.date, "d 'de' LLL", { locale: es })}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {/* Leyenda */}
        {rows.length > 0 && (
          <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-[var(--color-ink-3)]">
            <span>menos</span>
            <span className="h-3 w-3 rounded-[2px] bg-[var(--color-surface-2)]" />
            <span className="h-3 w-3 rounded-[2px]" style={{ backgroundColor: intensityColor(0.25) }} />
            <span className="h-3 w-3 rounded-[2px]" style={{ backgroundColor: intensityColor(0.5) }} />
            <span className="h-3 w-3 rounded-[2px]" style={{ backgroundColor: intensityColor(0.75) }} />
            <span className="h-3 w-3 rounded-[2px]" style={{ backgroundColor: intensityColor(1) }} />
            <span>más</span>
          </div>
        )}
      </div>
    </div>
  )
}

function intensityColor(t: number): string {
  // Verde con opacidad creciente. t ∈ [0, 1]
  const alpha = 0.20 + 0.75 * Math.min(1, Math.max(0, t))
  return `rgba(16, 185, 129, ${alpha.toFixed(2)})`
}
