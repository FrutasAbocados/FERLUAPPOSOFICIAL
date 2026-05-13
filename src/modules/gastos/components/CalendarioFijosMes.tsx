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
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
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
                inMonth ? 'border-[var(--color-border)] bg-[var(--color-surface)]' : 'border-transparent bg-[var(--color-surface-2)] opacity-60',
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
    case 'pagado':  return 'bg-[#10b98122] text-[#047857] hover:bg-[#10b98144]'
    case 'vencido': return 'bg-[#ef444422] text-[#b91c1c] hover:bg-[#ef444444]'
    case 'proximo': return 'bg-[#f59e0b22] text-[#92400e] hover:bg-[#f59e0b44]'
    case 'futuro':  return 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-3,#e2e8f0)]'
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
      <Pill label="Pagado"  cls="bg-[#10b98122] text-[#047857]" />
      <Pill label="Vencido" cls="bg-[#ef444422] text-[#b91c1c]" />
      <Pill label="≤7 días" cls="bg-[#f59e0b22] text-[#92400e]" />
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
