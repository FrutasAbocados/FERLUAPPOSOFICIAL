import { format, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { euros } from '../lib/format'
import type { Cierre } from '../lib/types'

type Props = {
  date: Date
  cierre: Cierre | undefined
  onClick: () => void
}

export function DayCard({ date, cierre, onClick }: Props) {
  const today = isSameDay(date, new Date())
  const weekday = format(date, 'EEEE', { locale: es })
  const dayNum = format(date, 'd')

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-[var(--radius-md)] border bg-[var(--color-surface)] p-3 text-left transition-all hover:border-[var(--color-primary)] hover:shadow-sm',
        today
          ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
          : 'border-[var(--color-border)]',
      )}
    >
      <div className="flex w-12 flex-col items-center">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
          {weekday.slice(0, 3)}
        </div>
        <div
          className={cn(
            'font-display text-2xl font-bold tabular-nums',
            today ? 'text-[var(--color-primary)]' : 'text-[var(--color-ink)]',
          )}
        >
          {dayNum}
        </div>
      </div>

      {cierre ? (
        <div className="grid flex-1 grid-cols-3 gap-2 text-xs">
          <Stat label="Cobrado" value={euros(cierre.total_cobrado)} />
          <Stat label="Gastos" value={euros(cierre.total_gastos)} />
          <Stat
            label="Resultado"
            value={euros(cierre.resultado)}
            tone={cierre.resultado >= 0 ? 'success' : 'danger'}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-between text-sm text-[var(--color-ink-3)]">
          <span>Sin cierre</span>
          <span className="flex items-center gap-1 text-[var(--color-primary)] opacity-0 transition-opacity group-hover:opacity-100">
            <Plus className="h-4 w-4" />
            Crear
          </span>
        </div>
      )}
    </button>
  )
}

type StatProps = { label: string; value: string; tone?: 'success' | 'danger' }

function Stat({ label, value, tone }: StatProps) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
        {label}
      </div>
      <div
        className={cn(
          'font-display text-sm font-bold tabular-nums',
          tone === 'success' && 'text-[var(--color-success)]',
          tone === 'danger' && 'text-[var(--color-danger)]',
          !tone && 'text-[var(--color-ink)]',
        )}
      >
        {value}
      </div>
    </div>
  )
}

