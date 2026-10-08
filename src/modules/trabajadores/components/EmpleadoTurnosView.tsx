import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useEmpleados, useTurnosRango } from '@/modules/turnos/lib/queries'
import { SHIFT_META, SHIFT_ORDER } from '@/modules/turnos/lib/shift-meta'
import { MiSemanaLista, EquipoSemanaTabla } from '@/modules/turnos/components/TurnosSemana'
import { mapTurnos } from '@/modules/turnos/lib/types'
import { formatRange, shiftWeek, weekDays, weekStart } from '@/modules/turnos/lib/week'
import type { EmpleadoPropio } from '../lib/useEmpleadoPropio'

const SEMANAS = 4

// Turnos del trabajador: 4 semanas seguidas desde la actual para poder planificar.
export function EmpleadoTurnosView({ empleado }: { empleado: EmpleadoPropio }) {
  const [anchor, setAnchor] = useState<Date>(() => weekStart(new Date()))
  const [modo, setModo] = useState<'mio' | 'equipo'>('mio')
  const turnos = useTurnosRango(anchor, SEMANAS)
  const empleados = useEmpleados()
  const map = useMemo(() => mapTurnos(turnos.data), [turnos.data])
  const equipo = (empleados.data ?? []).filter((e) => e.activo)
  const semanas = Array.from({ length: SEMANAS }, (_, i) => shiftWeek(anchor, i))
  const esActual = weekStart(new Date()).getTime() === anchor.getTime()

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-28 md:px-6 md:py-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-[var(--ink)]">Turnos</h1>
          <p className="text-xs text-[var(--ink-mute)]">Próximas {SEMANAS} semanas</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setAnchor((a) => shiftWeek(a, -1))} className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--ink-dim)]" aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {!esActual && (
            <button type="button" onClick={() => setAnchor(weekStart(new Date()))} className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--ink-dim)]">
              Hoy
            </button>
          )}
          <button type="button" onClick={() => setAnchor((a) => shiftWeek(a, 1))} className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--ink-dim)]" aria-label="Semana siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="ao-tabbar mb-3">
        <button type="button" onClick={() => setModo('mio')} className={modo === 'mio' ? 'ao-tab ao-tab-active' : 'ao-tab'}>Mis turnos</button>
        <button type="button" onClick={() => setModo('equipo')} className={modo === 'equipo' ? 'ao-tab ao-tab-active' : 'ao-tab'}>Equipo</button>
      </div>

      {turnos.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--ink-mute)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando turnos…
        </div>
      ) : (
        <div className="space-y-4">
          {semanas.map((s) => {
            const days = weekDays(s)
            return (
              <section key={s.toISOString()} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-mute)]">
                  Semana · {formatRange(s)}
                </div>
                {modo === 'mio'
                  ? <MiSemanaLista days={days} map={map} empleadoId={empleado.id} />
                  : <EquipoSemanaTabla days={days} map={map} equipo={equipo} empleadoId={empleado.id} />}
              </section>
            )
          })}
        </div>
      )}

      {modo === 'equipo' && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {SHIFT_ORDER.filter((t) => t !== 'power').map((t) => (
            <span key={t} className="rounded px-1.5 py-0.5 font-semibold" style={{ background: SHIFT_META[t].bg, color: SHIFT_META[t].fg }}>
              {SHIFT_META[t].short} · {SHIFT_META[t].label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
