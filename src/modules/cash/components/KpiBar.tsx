import { TrendingUp, TrendingDown, Wallet, Banknote } from 'lucide-react'
import { euros } from '../lib/format'
import { cn } from '@/shared/lib/utils'

type Props = {
  cobrado: number
  gastos: number
  resultado: number
  deudaAcum: number
}

export function KpiBar({ cobrado, gastos, resultado, deudaAcum }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi
        label="Cobrado mes"
        value={euros(cobrado)}
        icon={<Banknote className="h-4 w-4" />}
        tone="primary"
      />
      <Kpi
        label="Gastos mes"
        value={euros(gastos)}
        icon={<TrendingDown className="h-4 w-4" />}
        tone="warn"
      />
      <Kpi
        label="Resultado"
        value={euros(resultado)}
        icon={<TrendingUp className="h-4 w-4" />}
        tone={resultado >= 0 ? 'success' : 'danger'}
      />
      <Kpi
        label="Deuda acum"
        value={euros(deudaAcum)}
        icon={<Wallet className="h-4 w-4" />}
        tone={deudaAcum > 0 ? 'warn' : 'neutral'}
      />
    </div>
  )
}

type KpiProps = {
  label: string
  value: string
  icon: React.ReactNode
  tone: 'primary' | 'warn' | 'success' | 'danger' | 'neutral'
}

const TONE: Record<KpiProps['tone'], string> = {
  primary: 'text-[var(--color-primary)]',
  warn: 'text-[var(--color-warn)]',
  success: 'text-[var(--color-success)]',
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
      <div className={cn('mt-1 font-display text-xl font-bold tabular-nums md:text-2xl', TONE[tone])}>
        {value}
      </div>
    </div>
  )
}
