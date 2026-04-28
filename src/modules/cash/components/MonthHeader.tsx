import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

type Props = {
  anchor: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

export function MonthHeader({ anchor, onPrev, onNext, onToday }: Props) {
  const label = format(anchor, "LLLL 'de' yyyy", { locale: es })
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={onPrev} aria-label="Mes anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={onNext} aria-label="Mes siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onToday} className="gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Hoy
        </Button>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
          Mes
        </div>
        <div className="font-display text-sm font-semibold capitalize text-[var(--color-ink)] md:text-base">
          {label}
        </div>
      </div>
    </div>
  )
}
