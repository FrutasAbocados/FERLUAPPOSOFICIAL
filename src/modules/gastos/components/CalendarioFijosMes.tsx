import { useMemo } from 'react'
import { Check, CircleAlert, Clock } from 'lucide-react'
import {
  addDays,
  endOfMonth,
  format,
  getDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { euros } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { type CalendarioRow } from '../lib/hooks'

type Props = {
  anio: number
  mes: number
  rows: CalendarioRow[]
  onTogglePagado: (row: CalendarioRow) => void
}

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function CalendarioFijosMes({ anio, mes, rows, onTogglePagado }: Props) {
  const grid = useMemo(() => buildMonthGrid(anio, mes), [anio, mes])
  const byDate = useMemo(() => groupByDate(rows), [rows])

  return (
    <div className="ao-card p-3">
      <div className="label-caps mb-2 grid grid-cols-7 gap-1 text-center">
        {DOW.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((day, i) => {
          const iso = format(day, 'yyyy-MM-dd')
          const cargos = byDate.get(iso) ?? []
          const inMonth = isSameMonth(day, new Date(anio, mes - 1, 1))
          const today = isToday(day)
          return (
            <div
              key={i}
              className={cn(
                'flex min-h-[68px] flex-col gap-1 rounded-md border p-1 text-xs md:min-h-[88px]',
                inMonth ? 'border-[var(--color-border)] bg-[var(--color-surface)]' : 'border-transparent bg-[rgba(255,255,255,.015)] opacity-60',
                today && 'ring-2 ring-[var(--color-primary)]',
              )}
            >
              <div className={cn('text-[10px] font-semibold tabular-nums', inMonth ? 'text-[var(--color-ink-2)]' : 'text-[var(--color-ink-3)]')}>
                {format(day, 'd')}
              </div>
              <div className="flex flex-col gap-0.5">
                {cargos.map((c) => (
                  <button
                    key={c.fijo_id}
                    type="button"
                    onClick={() => onTogglePagado(c)}
                    className={cn(
                      'group flex items-center gap-1 rounded-sm px-1 py-0.5 text-left text-[10px] font-medium transition-colors',
                      estadoClass(c.estado),
                    )}
                    title={`${c.nombre} · ${euros(c.total)} · ${c.estado}`}
                  >
                    <span className="shrink-0">{estadoIcon(c.estado)}</span>
                    <span className="truncate">{c.nombre}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <Leyenda />
    </div>
  )
}

function buildMonthGrid(anio: number, mes: number): Date[] {
  const first = startOfMonth(new Date(anio, mes - 1, 1))
  const last = endOfMonth(first)
  // Lunes-domingo: getDay devuelve 0=domingo. Lunes=1.
  const offsetStart = (getDay(first) + 6) % 7
  const start = addDays(first, -offsetStart)
  const totalDays = offsetStart + (last.getDate())
  const cells = Math.ceil(totalDays / 7) * 7
  return Array.from({ length: cells }).map((_, i) => addDays(start, i))
}

function groupByDate(rows: CalendarioRow[]): Map<string, CalendarioRow[]> {
  const m = new Map<string, CalendarioRow[]>()
  for (const r of rows) {
    const k = r.fecha_cargo
    const arr = m.get(k) ?? []
    arr.push(r)
    m.set(k, arr)
  }
  // Ordenar dentro de cada día por nombre
  m.forEach((arr) => arr.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
  return m
}

function estadoClass(estado: CalendarioRow['estado']): string {
  switch (estado) {
    case 'pagado':  return 'bg-[var(--mint-glow)] text-[var(--mint)] hover:bg-[oklch(78%_.14_158_/_0.26)]'
    case 'vencido': return 'bg-[var(--color-danger-soft)] text-[var(--coral)] hover:bg-[oklch(30%_.12_25_/_0.32)]'
    case 'proximo': return 'bg-[var(--color-warn-soft)] text-[var(--amber)] hover:bg-[oklch(30%_.10_70_/_0.32)]'
    case 'futuro':  return 'bg-[rgba(255,255,255,.025)] text-[var(--color-ink-2)] hover:bg-[rgba(255,255,255,.04)]'
  }
}

function estadoIcon(estado: CalendarioRow['estado']) {
  if (estado === 'pagado')  return <Check className="h-3 w-3" />
  if (estado === 'vencido') return <CircleAlert className="h-3 w-3" />
  if (estado === 'proximo') return <Clock className="h-3 w-3" />
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-50" />
}

function Leyenda() {
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--color-ink-3)]">
      <Pill label="Pagado"  cls="bg-[var(--mint-glow)] text-[var(--mint)]" />
      <Pill label="Vencido" cls="bg-[var(--color-danger-soft)] text-[var(--coral)]" />
      <Pill label="≤7 días" cls="bg-[var(--color-warn-soft)] text-[var(--amber)]" />
      <Pill label="Futuro"  cls="bg-[var(--color-surface-2)] text-[var(--color-ink-2)]" />
      <span className="ml-auto">Click en una burbuja para alternar pagado</span>
    </div>
  )
}

function Pill({ label, cls }: { label: string; cls: string }) {
  return <span className={cn('rounded-sm px-1.5 py-0.5 font-medium', cls)}>{label}</span>
}

// Helper para evitar warning de import sin usar
void parseISO
void es
