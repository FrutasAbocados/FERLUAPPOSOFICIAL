import { format } from 'date-fns'
import { ShiftCell } from './ShiftCell'
import { isToday, isoDate, weekDays } from '../lib/week'
import { nextInCycle } from '../lib/shift-meta'
import { turnoKey, type Empleado, type ShiftType, type Turno } from '../lib/types'

type Props = {
  anchor: Date
  empleados: Empleado[]
  turnos: Turno[]
  isAdmin: boolean
  currentUserEmpleadoId: string | null
  pendingKey: string | null
  onSet: (empleadoId: string, fechaISO: string, next: ShiftType | null) => void
}

export function WeekGrid({
  anchor,
  empleados,
  turnos,
  isAdmin,
  currentUserEmpleadoId,
  pendingKey,
  onSet,
}: Props) {
  const days = weekDays(anchor)
  const turnoMap = new Map<string, Turno>()
  for (const t of turnos) turnoMap.set(turnoKey(t.empleado_id, t.fecha), t)

  return (
    <div className="ao-card overflow-x-auto p-0">
      <div
        className="grid min-w-[640px] gap-px bg-[var(--color-border)]"
        style={{ gridTemplateColumns: '160px repeat(7, minmax(64px, 1fr))' }}
      >
        {/* Header row */}
        <div className="label-caps bg-[rgba(255,255,255,.025)] px-3 py-2">
          Empleado
        </div>
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className={`bg-[rgba(255,255,255,.025)] px-2 py-2 text-center ${
              isToday(d) ? 'text-[var(--color-primary)]' : 'text-[var(--color-ink-2)]'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider">
              {format(d, 'EEE')}
            </div>
            <div className="mono text-sm font-semibold">{format(d, 'd')}</div>
          </div>
        ))}

        {/* Body rows */}
        {empleados.map((emp) => {
          const editable = isAdmin
          const isMine = emp.id === currentUserEmpleadoId
          return (
            <div key={emp.id} className="contents">
              <div
                className={`flex items-center bg-[var(--color-surface)] px-3 py-2 ${
                  isMine ? 'font-bold text-[var(--color-primary)]' : 'text-[var(--color-ink)]'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {emp.alias || emp.nombre}
                  </div>
                  {emp.alias && (
                    <div className="truncate text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                      {emp.nombre}
                    </div>
                  )}
                </div>
              </div>
              {days.map((d) => {
                const fechaISO = isoDate(d)
                const k = turnoKey(emp.id, fechaISO)
                const t = turnoMap.get(k) ?? null
                const isPending = pendingKey === k
                return (
                  <div key={fechaISO} className="bg-[var(--color-surface)] p-1.5">
                    <ShiftCell
                      tipo={t?.tipo ?? null}
                      editable={editable && !isPending}
                      isToday={isToday(d)}
                      onClick={() => {
                        if (!editable) return
                        const next = nextInCycle(t?.tipo ?? null)
                        onSet(emp.id, fechaISO, next)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
