import { Check, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { isAfter, parseISO } from 'date-fns'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import type { Empleado } from '@/modules/turnos/lib/types'
import {
  ESTADO_LABEL,
  PRIORIDAD_LABEL,
  type Tarea,
  type TareaEstado,
  type TareaPrioridad,
} from '../lib/types'

type Props = {
  tareas: Tarea[]
  empleadosById: Map<string, Empleado>
  onEdit: (t: Tarea) => void
  onDelete: (t: Tarea) => void
  onChangeEstado: (t: Tarea, estado: TareaEstado) => void
}

export function TareasList({
  tareas,
  empleadosById,
  onEdit,
  onDelete,
  onChangeEstado,
}: Props) {
  if (tareas.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-ink-3)]">
        Sin tareas con esos filtros.
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {tareas.map((t, i) => (
        <Row
          key={t.id}
          tarea={t}
          empleado={t.asignado_a ? empleadosById.get(t.asignado_a) ?? null : null}
          first={i === 0}
          onEdit={() => onEdit(t)}
          onDelete={() => onDelete(t)}
          onChangeEstado={(e) => onChangeEstado(t, e)}
        />
      ))}
    </div>
  )
}

function Row({
  tarea,
  empleado,
  first,
  onEdit,
  onDelete,
  onChangeEstado,
}: {
  tarea: Tarea
  empleado: Empleado | null
  first: boolean
  onEdit: () => void
  onDelete: () => void
  onChangeEstado: (e: TareaEstado) => void
}) {
  const isHecha = tarea.estado === 'hecha'
  const isCancelada = tarea.estado === 'cancelada'
  const dim = isHecha || isCancelada
  const atrasada =
    !dim &&
    tarea.fecha_vencimiento &&
    isAfter(new Date(new Date().toDateString()), parseISO(tarea.fecha_vencimiento))

  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-3 px-3 py-3 md:flex-nowrap',
        !first && 'border-t border-[var(--color-border)]',
        dim && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={() => onChangeEstado(isHecha ? 'pendiente' : 'hecha')}
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
          isHecha
            ? 'border-[var(--color-success)] bg-[var(--color-success)] text-white'
            : 'border-[var(--color-border-strong)] hover:border-[var(--color-primary)]',
        )}
        aria-label={isHecha ? 'Reabrir tarea' : 'Marcar hecha'}
      >
        {isHecha && <Check className="h-3.5 w-3.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'font-display text-sm font-bold text-[var(--color-ink)]',
            isHecha && 'line-through',
          )}
        >
          {tarea.titulo}
        </div>
        {tarea.descripcion && (
          <div className="mt-0.5 line-clamp-2 text-xs text-[var(--color-ink-2)]">
            {tarea.descripcion}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
          <PrioridadBadge prioridad={tarea.prioridad} />
          <EstadoBadge estado={tarea.estado} />
          {empleado && (
            <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 font-semibold text-[var(--color-ink-2)]">
              👤 {empleado.alias || empleado.nombre}
            </span>
          )}
          {tarea.categoria && (
            <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 font-semibold text-[var(--color-ink-2)]">
              {tarea.categoria}
            </span>
          )}
          {tarea.fecha_vencimiento && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-semibold',
                atrasada
                  ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)]',
              )}
            >
              {atrasada ? '⚠ ' : '📅 '}
              {tarea.fecha_vencimiento}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {tarea.estado !== 'cancelada' && tarea.estado !== 'hecha' && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onChangeEstado('cancelada')}
            aria-label="Cancelar"
            title="Cancelar"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Eliminar">
          <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
        </Button>
      </div>
    </div>
  )
}

function PrioridadBadge({ prioridad }: { prioridad: TareaPrioridad }) {
  const tone = {
    alta: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    media: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]',
    baja: 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)]',
  }[prioridad]
  return (
    <span className={`rounded-full px-2 py-0.5 font-bold uppercase tracking-wider ${tone}`}>
      {PRIORIDAD_LABEL[prioridad]}
    </span>
  )
}

function EstadoBadge({ estado }: { estado: TareaEstado }) {
  const tone = {
    pendiente: 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)]',
    en_progreso: 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]',
    hecha: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
    cancelada: 'bg-[var(--color-surface-2)] text-[var(--color-ink-3)]',
  }[estado]
  return (
    <span className={`rounded-full px-2 py-0.5 font-bold uppercase tracking-wider ${tone}`}>
      {ESTADO_LABEL[estado]}
    </span>
  )
}
