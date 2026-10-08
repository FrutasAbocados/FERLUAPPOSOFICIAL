import { cn } from '@/shared/lib/utils'
import { SHIFT_META, hhmm } from '../lib/shift-meta'
import type { Turno } from '../lib/types'

type Props = {
  turno: Turno | null
  editable: boolean
  isToday: boolean
  onClick?: () => void
}

export function ShiftCell({ turno, editable, isToday, onClick }: Props) {
  const meta = turno ? SHIFT_META[turno.tipo] : null
  const style = meta
    ? { background: meta.bg, color: meta.fg, borderColor: meta.border }
    : undefined
  const ini = hhmm(turno?.hora_inicio)
  const fin = hhmm(turno?.hora_fin)

  return (
    <button
      type="button"
      disabled={!editable}
      onClick={onClick}
      title={turno?.notas ?? meta?.label}
      className={cn(
        'h-12 w-full rounded-[var(--radius-md)] border leading-tight transition-all',
        'flex flex-col items-center justify-center',
        meta
          ? 'border-2 shadow-sm'
          : 'border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-ink-3)]',
        editable && 'cursor-pointer active:scale-95 hover:brightness-105',
        !editable && 'cursor-default',
        isToday && !meta && 'ring-1 ring-[var(--color-primary)] ring-offset-1',
        isToday && meta && 'ring-2 ring-[var(--color-primary)] ring-offset-1',
      )}
      style={style}
      aria-label={meta ? meta.label : 'Sin turno asignado'}
    >
      <span className="text-sm font-bold">{meta ? meta.short : '·'}</span>
      {ini && fin && <span className="text-[9px] font-semibold tabular-nums opacity-80">{ini}–{fin}</span>}
    </button>
  )
}
