import { Wallet, AlertTriangle, Clock, Calendar } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { euros } from '../lib/format'

type Props = {
  totalDisponible: number
  pagosProximos7d: number
  pagosMesActual: number
  totalPendiente: number
}

export function KpiBar({
  totalDisponible,
  pagosProximos7d,
  pagosMesActual,
  totalPendiente,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi
        label="Disponible total"
        value={euros(totalDisponible)}
        icon={<Wallet className="h-4 w-4" />}
        tone={totalDisponible >= 0 ? 'primary' : 'danger'}
      />
      <Kpi
        label="Próximos 7 días"
        value={euros(pagosProximos7d)}
        icon={<Clock className="h-4 w-4" />}
        tone={pagosProximos7d > 0 ? 'warn' : 'neutral'}
      />
      <Kpi
        label="Pagos este mes"
        value={euros(pagosMesActual)}
        icon={<Calendar className="h-4 w-4" />}
        tone="neutral"
      />
      <Kpi
        label="Pendiente total"
        value={euros(totalPendiente)}
        icon={<AlertTriangle className="h-4 w-4" />}
        tone={totalPendiente > 0 ? 'danger' : 'neutral'}
      />
    </div>
  )
}

type KpiProps = {
  label: string
  value: string
  icon: React.ReactNode
  tone: 'primary' | 'warn' | 'danger' | 'neutral'
}

const TONE: Record<KpiProps['tone'], string> = {
  primary: 'text-[var(--color-primary)]',
  warn: 'text-[var(--color-warn)]',
  danger: 'text-[var(--color-danger)]',
  neutral: 'text-[var(--color-ink-2)]',
}

function Kpi({ label, value, icon, tone }: KpiProps) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
        <span className={cn(TONE[tone])}>{icon}</span>
        {label}
      </div>
      <div
        className={cn(
          'mt-1 font-display text-xl font-bold tabular-nums md:text-2xl',
          TONE[tone],
        )}
      >
        {value}
      </div>
    </div>
  )
}
