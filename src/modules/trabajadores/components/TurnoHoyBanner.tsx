import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarClock, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { useEmpleados, useTurnosOfWeek } from '@/modules/turnos/lib/queries'
import { SHIFT_META, horario } from '@/modules/turnos/lib/shift-meta'
import { MiSemanaLista, EquipoSemanaTabla } from '@/modules/turnos/components/TurnosSemana'
import { mapTurnos } from '@/modules/turnos/lib/types'
import { isoDate, shiftWeek, weekDays, weekStart, formatRange } from '@/modules/turnos/lib/week'

// Banner fijo arriba en la app del empleado con el turno de hoy.
// Al pulsarlo abre la semana: la suya en lista y la del equipo en rejilla.
export function TurnoHoyBanner({ empleadoId }: { empleadoId: string }) {
  const [open, setOpen] = useState(false)
  const hoy = new Date()
  const turnos = useTurnosOfWeek(weekStart(hoy))
  const turnoHoy = (turnos.data ?? []).find(
    (t) => t.empleado_id === empleadoId && t.fecha === isoDate(hoy),
  )
  const meta = turnoHoy ? SHIFT_META[turnoHoy.tipo] : null

  const bg = meta
    ? `linear-gradient(135deg, ${meta.bg} 0%, ${meta.border} 100%)`
    : 'linear-gradient(135deg, #334155 0%, #1e293b 100%)'
  const fg = meta?.fg ?? '#f1f5f9'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sticky top-0 z-20 mb-4 w-full rounded-xl px-4 py-3 text-left transition-transform active:scale-[.98]"
        style={{
          background: bg,
          color: fg,
          boxShadow: meta ? `0 0 24px ${meta.bg}99, 0 0 0 1px ${meta.border}` : undefined,
        }}
        aria-label="Ver turnos de la semana"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">
              Tu turno hoy · {format(hoy, "EEEE d 'de' LLLL", { locale: es })}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-display text-2xl font-extrabold leading-tight">
                {turnos.isLoading ? '…' : meta ? meta.label : 'Sin turno asignado'}
              </span>
              {horario(turnoHoy) && (
                <span className="font-display text-xl font-bold tabular-nums">{horario(turnoHoy)}</span>
              )}
            </div>
            {(turnoHoy?.notas || meta) && (
              <div className="truncate text-xs font-medium opacity-85">
                {turnoHoy?.notas || meta?.description}
              </div>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-col items-center gap-0.5 text-[10px] font-semibold uppercase opacity-90">
            <CalendarClock className="h-6 w-6" />
            Semana
          </div>
        </div>
      </button>
      {open && <SemanaTurnosModal empleadoId={empleadoId} onClose={() => setOpen(false)} />}
    </>
  )
}

function SemanaTurnosModal({ empleadoId, onClose }: { empleadoId: string; onClose: () => void }) {
  const [anchor, setAnchor] = useState<Date>(() => weekStart(new Date()))
  const turnos = useTurnosOfWeek(anchor)
  const empleados = useEmpleados()
  const days = weekDays(anchor)

  const map = useMemo(() => mapTurnos(turnos.data), [turnos.data])

  const equipo = (empleados.data ?? []).filter((e) => e.activo)

  return (
    <Modal onClose={onClose} size="lg" ariaLabel="Turnos de la semana">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <button type="button" onClick={() => setAnchor((a) => shiftWeek(a, -1))} className="rounded-lg p-1.5 text-[var(--ink-dim)] hover:bg-white/5" aria-label="Semana anterior">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-mute)]">Turnos</div>
          <div className="text-sm font-semibold text-[var(--ink)]">{formatRange(anchor)}</div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setAnchor((a) => shiftWeek(a, 1))} className="rounded-lg p-1.5 text-[var(--ink-dim)] hover:bg-white/5" aria-label="Semana siguiente">
            <ChevronRight className="h-5 w-5" />
          </button>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--ink-mute)] hover:bg-white/5" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="p-3">
        <MiSemanaLista days={days} map={map} empleadoId={empleadoId} />
      </div>

      {equipo.length > 0 && (
        <div className="border-t border-[var(--line)] p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--ink-mute)]">Equipo</div>
          <EquipoSemanaTabla days={days} map={map} equipo={equipo} empleadoId={empleadoId} />
        </div>
      )}
    </Modal>
  )
}
