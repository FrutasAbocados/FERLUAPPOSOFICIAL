import { cn } from '@/shared/lib/utils'
import { SHIFT_META } from '../lib/shift-meta'
import type { ShiftType } from '../lib/types'

type Props = {
  tipo: ShiftType | null
  editable: boolean
  isToday: boolean
  onClick?: () => void
}

export function ShiftCell({ tipo, editable, isToday, onClick }: Props) {
  const meta = tipo ? SHIFT_META[tipo] : null
  const style = meta
    ? { background: meta.bg, color: meta.fg, borderColor: meta.border }
    : undefined

  return (
    <button
      type="button"
      disabled={!editable}
      onClick={onClick}
      className={cn(
        'h-12 w-full rounded-[var(--radius-md)] border text-sm font-bold transition-all',
        'flex items-center justify-center',
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
      {meta ? meta.short : '·'}
    </button>
  )
}
