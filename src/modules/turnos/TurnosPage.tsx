import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/shared/auth/AuthContext'
import { WeekHeader } from './components/WeekHeader'
import { WeekGrid } from './components/WeekGrid'
import { Legend } from './components/Legend'
import { AddEmpleadoForm } from './components/AddEmpleadoForm'
import {
  useEmpleados,
  useSetTurno,
  useTurnosOfWeek,
} from './lib/queries'
import { shiftWeek, weekStart } from './lib/week'
import { turnoKey, type ShiftType } from './lib/types'

export function TurnosPage() {
  const { profile, user } = useAuth()
  const isAdmin = profile?.role === 'admin_full' || profile?.role === 'admin_op'

  const [anchor, setAnchor] = useState<Date>(() => weekStart(new Date()))

  const empleados = useEmpleados()
  const turnos = useTurnosOfWeek(anchor)
  const setTurno = useSetTurno()

  const visibleEmpleados = useMemo(
    () => (empleados.data ?? []).filter((e) => e.activo),
    [empleados.data],
  )

  const currentUserEmpleadoId = useMemo(() => {
    if (!user) return null
    return (empleados.data ?? []).find((e) => e.user_id === user.id)?.id ?? null
  }, [empleados.data, user])

  const pendingKey =
    setTurno.isPending && setTurno.variables
      ? turnoKey(setTurno.variables.empleado_id, setTurno.variables.fecha)
      : null

  const handleSet = (empleadoId: string, fecha: string, next: ShiftType | null) => {
    setTurno.mutate({ empleado_id: empleadoId, fecha, tipo: next, weekAnchor: anchor })
  }

  const loading = empleados.isLoading || turnos.isLoading
  const error = empleados.error || turnos.error

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
            Módulo
          </p>
          <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">
            Turnos
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
            {isAdmin
              ? 'Toca una celda para asignar turno. Cicla: ·  → Compra → Mañana → Libre → Power.'
              : 'Tu planning semanal. Solo lectura.'}
          </p>
        </div>
        <WeekHeader
          anchor={anchor}
          onPrev={() => setAnchor((a) => shiftWeek(a, -1))}
          onNext={() => setAnchor((a) => shiftWeek(a, 1))}
          onToday={() => setAnchor(weekStart(new Date()))}
        />
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Legend />
        {isAdmin && <AddEmpleadoForm />}
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
          Error: {(error as Error).message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-sm text-[var(--color-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando turnos…
        </div>
      ) : visibleEmpleados.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-10 text-center">
          <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
            Aún no hay empleados
          </h2>
          <p className="mx-auto mt-1 max-w-prose text-sm text-[var(--color-ink-2)]">
            {isAdmin
              ? 'Crea el primero con "Nuevo empleado" para empezar a planificar la semana.'
              : 'Avisa al admin para que dé de alta al equipo.'}
          </p>
        </div>
      ) : (
        <WeekGrid
          anchor={anchor}
          empleados={visibleEmpleados}
          turnos={turnos.data ?? []}
          isAdmin={isAdmin}
          currentUserEmpleadoId={currentUserEmpleadoId}
          pendingKey={pendingKey}
          onSet={handleSet}
        />
      )}
    </div>
  )
}
