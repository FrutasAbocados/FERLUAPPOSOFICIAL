import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Target, CheckCircle2, Clock } from 'lucide-react'
import { euros } from '@/shared/lib/format'
import { useObjetivoSelf } from '../lib/objetivos-queries'

export function EmpleadoObjetivoCard() {
  const mesISO = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const { data, isLoading } = useObjetivoSelf(mesISO)

  if (isLoading || !data) return null

  const cumplido = data.cumplido

  return (
    <section className="ao-card mb-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
              Tu objetivo · {format(new Date(mesISO), 'LLLL yyyy', { locale: es })}
            </div>
            <div className="text-sm font-semibold text-[var(--color-ink)]">{data.titulo}</div>
            {data.descripcion && (
              <p className="mt-0.5 text-xs text-[var(--color-ink-2)]">{data.descripcion}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold tabular-nums text-[var(--color-primary)]">{euros(data.importe)}</div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">al mes si se cumple</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-[var(--line)] pt-3">
        {cumplido ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[oklch(90%_.1_150_/_0.6)] px-3 py-1 text-xs font-semibold text-[oklch(38%_.12_150)] dark:bg-[oklch(30%_.09_150_/_0.4)] dark:text-[oklch(80%_.14_150)]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Cumplido este mes · {euros(data.importe)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-xs font-semibold text-[var(--color-ink-2)]">
            <Clock className="h-3.5 w-3.5" /> Pendiente de confirmar a fin de mes
          </span>
        )}
      </div>
    </section>
  )
}
