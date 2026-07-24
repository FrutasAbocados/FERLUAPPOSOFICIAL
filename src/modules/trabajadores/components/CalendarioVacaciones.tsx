import { useMemo } from 'react'
import { eachDayOfInterval, endOfMonth, format, getDay, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { festivosMap } from '../lib/festivos'

type Estado = 'pendiente' | 'aprobado' | 'disfrutado'

interface Periodo {
  fecha_inicio: string
  fecha_fin: string
  estado: Estado
}

interface Props {
  anio: number
  periodos: Periodo[]
}

const DIAS_HEADER = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const TONO: Record<Estado, string> = {
  disfrutado: 'ao-tone-success',
  aprobado:   'ao-tone-info',
  pendiente:  'ao-tone-warning',
}

export function CalendarioVacaciones({ anio, periodos }: Props) {
  const festivos = useMemo(() => festivosMap(anio), [anio])

  const diaToEstado = useMemo(() => {
    const m = new Map<string, Estado>()
    for (const p of periodos) {
      const ini = parseISO(p.fecha_inicio)
      const fin = parseISO(p.fecha_fin)
      for (const d of eachDayOfInterval({ start: ini, end: fin })) {
        const iso = format(d, 'yyyy-MM-dd')
        // prioridad disfrutado > aprobado > pendiente si solapan
        const prev = m.get(iso)
        if (!prev || prio(p.estado) > prio(prev)) m.set(iso, p.estado)
      }
    }
    return m
  }, [periodos])

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <Mes key={i} anio={anio} mes={i} festivos={festivos} diaToEstado={diaToEstado} />
      ))}
      <Leyenda />
    </div>
  )
}

function Mes({
  anio, mes, festivos, diaToEstado,
}: { anio: number; mes: number; festivos: Map<string, { nombre: string; ambito: string }>; diaToEstado: Map<string, Estado> }) {
  const date = new Date(anio, mes, 1)
  const dias = eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) })
  const offset = (getDay(dias[0]) + 6) % 7  // lunes = 0

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <h3 className="mb-2 text-center text-sm font-semibold capitalize text-[var(--color-ink)]">
        {format(date, 'LLLL', { locale: es })}
      </h3>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-[var(--color-ink-3)]">
        {DIAS_HEADER.map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5">
        {Array.from({ length: offset }).map((_, i) => <div key={`o${i}`} />)}
        {dias.map(d => {
          const iso = format(d, 'yyyy-MM-dd')
          const fes = festivos.get(iso)
          const est = diaToEstado.get(iso)
          const dow = getDay(d)
          const finde = dow === 0 || dow === 6
          const num = d.getDate()

          let cls = 'flex h-7 w-full items-center justify-center rounded text-xs tabular-nums'
          let title = ''

          if (est) {
            cls += ` ${TONO[est]} font-bold`
            title = `Vacaciones · ${est}`
          } else if (fes) {
            cls += ' ao-tone-danger font-semibold'
            title = `Festivo: ${fes.nombre}`
          } else if (finde) {
            cls += ' bg-[var(--color-surface-2)] text-[var(--color-ink-3)]'
          } else {
            cls += ' text-[var(--color-ink-2)]'
          }

          return (
            <div key={iso} className={cls} title={title || undefined}>
              {num}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Leyenda() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs">
      <p className="mb-2 font-semibold text-[var(--color-ink)]">Leyenda</p>
      <ul className="space-y-1 text-[var(--color-ink-3)]">
        <li><span className="mr-2 inline-block h-3 w-3 rounded bg-emerald-400 align-middle" />Disfrutado</li>
        <li><span className="mr-2 inline-block h-3 w-3 rounded bg-blue-300 align-middle" />Aprobado</li>
        <li><span className="mr-2 inline-block h-3 w-3 rounded bg-amber-300 align-middle" />Pendiente</li>
        <li><span className="ao-tone-danger mr-2 inline-block h-3 w-3 rounded align-middle" />Festivo</li>
        <li><span className="mr-2 inline-block h-3 w-3 rounded bg-[var(--color-surface-2)] align-middle" />Fin de semana</li>
      </ul>
    </div>
  )
}

function prio(e: Estado): number {
  return e === 'disfrutado' ? 3 : e === 'aprobado' ? 2 : 1
}
