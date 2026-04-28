import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { formatRange } from '../lib/week'

type Props = {
  anchor: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

export function WeekHeader({ anchor, onPrev, onNext, onToday }: Props) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={onPrev} aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={onNext} aria-label="Semana siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onToday} className="gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          Hoy
        </Button>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
          Semana
        </div>
        <div className="font-display text-sm font-semibold text-[var(--color-ink)] md:text-base">
          {formatRange(anchor)}
        </div>
      </div>
    </div>
  )
}
