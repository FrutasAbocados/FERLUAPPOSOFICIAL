import { useMemo, useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { confirm } from '@/shared/lib/confirm'
import { TareaForm } from './components/TareaForm'
import { TareasList } from './components/TareasList'
import type { Empleado } from '@/modules/turnos/lib/types'
import {
  useDeleteTarea,
  useEmpleadosList,
  useTareas,
  useUpdateTarea,
} from './lib/queries'
import { PRIORIDAD_ORDER, type Tarea, type TareaEstado } from './lib/types'

const FILTROS: { key: TareaEstado | 'activas' | 'todas'; label: string }[] = [
  { key: 'activas', label: 'Activas' },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'en_progreso', label: 'En curso' },
  { key: 'hecha', label: 'Hechas' },
  { key: 'cancelada', label: 'Canceladas' },
  { key: 'todas', label: 'Todas' },
]

export function TareasPage() {
  const tareas = useTareas()
  const empleados = useEmpleadosList()
  const update = useUpdateTarea()
  const del = useDeleteTarea()

  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['key']>('activas')
  const [editing, setEditing] = useState<Tarea | null>(null)
  const [creating, setCreating] = useState(false)

  const empleadosById = useMemo(() => {
    const m = new Map<string, Empleado>()
    for (const e of empleados.data ?? []) m.set(e.id, e)
    return m
  }, [empleados.data])

  const visibles = useMemo(() => {
    const list = tareas.data ?? []
    const filtered =
      filtro === 'todas'
        ? list
        : filtro === 'activas'
          ? list.filter((t) => t.estado === 'pendiente' || t.estado === 'en_progreso')
          : list.filter((t) => t.estado === filtro)
    // ordena por: estado activo primero, prioridad alta primero, vencimiento más cercano
    return [...filtered].sort((a, b) => {
      const aActiva = a.estado === 'pendiente' || a.estado === 'en_progreso' ? 0 : 1
      const bActiva = b.estado === 'pendiente' || b.estado === 'en_progreso' ? 0 : 1
      if (aActiva !== bActiva) return aActiva - bActiva
      const pa = PRIORIDAD_ORDER[a.prioridad] - PRIORIDAD_ORDER[b.prioridad]
      if (pa !== 0) return pa
      if (a.fecha_vencimiento && b.fecha_vencimiento) {
        return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)
      }
      if (a.fecha_vencimiento) return -1
      if (b.fecha_vencimiento) return 1
      return b.created_at.localeCompare(a.created_at)
    })
  }, [tareas.data, filtro])

  const counts = useMemo(() => {
    const list = tareas.data ?? []
    return {
      activas: list.filter((t) => t.estado === 'pendiente' || t.estado === 'en_progreso').length,
      pendiente: list.filter((t) => t.estado === 'pendiente').length,
      en_progreso: list.filter((t) => t.estado === 'en_progreso').length,
      hecha: list.filter((t) => t.estado === 'hecha').length,
      cancelada: list.filter((t) => t.estado === 'cancelada').length,
      todas: list.length,
    }
  }, [tareas.data])

  const onChangeEstado = (t: Tarea, estado: TareaEstado) => {
    update.mutate({ id: t.id, patch: { estado } })
  }

  const onDelete = async (t: Tarea) => {
    const ok = await confirm({ title: `¿Borrar "${t.titulo}"?`, confirmLabel: 'Borrar', variant: 'danger' })
    if (!ok) return
    del.mutate(t.id)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
            Módulo
          </p>
          <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">
            Tareas
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
            Lista interna. Crea, asigna a empleado, marca como hecha.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nueva tarea
        </Button>
      </header>

      <div className="mb-4 flex flex-wrap gap-1">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltro(f.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
              filtro === f.key
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
            )}
          >
            {f.label}
            <span
              className={cn(
                'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                filtro === f.key
                  ? 'bg-white/20'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-ink-3)]',
              )}
            >
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {tareas.error && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
          Error: {(tareas.error as Error).message}
        </div>
      )}

      {tareas.isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-sm text-[var(--color-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando tareas…
        </div>
      ) : (
        <TareasList
          tareas={visibles}
          empleadosById={empleadosById}
          onEdit={setEditing}
          onDelete={onDelete}
          onChangeEstado={onChangeEstado}
        />
      )}

      {creating && <TareaForm tarea={null} onClose={() => setCreating(false)} />}
      {editing && <TareaForm tarea={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
