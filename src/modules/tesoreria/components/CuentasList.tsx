import { Banknote, CreditCard, Coins, Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { CUENTA_TIPO_LABEL, type CuentaConSaldo, type CuentaTipo } from '../lib/types'
import { euros } from '../lib/format'

const TIPO_ICON: Record<CuentaTipo, React.ComponentType<{ className?: string }>> = {
  corriente: Banknote,
  efectivo: Coins,
  credito: CreditCard,
}

type Props = {
  cuentas: CuentaConSaldo[]
  isAdminFull: boolean
  onAddCuenta: () => void
  onAddMovimiento: (cuentaId: string) => void
}

export function CuentasList({ cuentas, isAdminFull, onAddCuenta, onAddMovimiento }: Props) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
          Cuentas
        </h2>
        {isAdminFull && (
          <Button variant="outline" size="sm" onClick={onAddCuenta} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Nueva cuenta
          </Button>
        )}
      </div>

      {cuentas.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-center text-sm text-[var(--color-ink-3)]">
          Sin cuentas todavía. {isAdminFull && 'Crea la primera para empezar.'}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {cuentas.map((c) => {
            const Icon = TIPO_ICON[c.tipo]
            const negative = c.saldo_actual < 0
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-sm font-bold text-[var(--color-ink)]">
                    {c.nombre}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                    {CUENTA_TIPO_LABEL[c.tipo]}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={cn(
                      'font-display text-lg font-bold tabular-nums',
                      negative
                        ? 'text-[var(--color-danger)]'
                        : 'text-[var(--color-ink)]',
                    )}
                  >
                    {euros(c.saldo_actual)}
                  </div>
                  {c.tipo === 'credito' && c.limite_credito != null && (
                    <div className="text-[10px] text-[var(--color-ink-3)]">
                      Límite {euros(c.limite_credito)}
                    </div>
                  )}
                </div>
                {isAdminFull && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onAddMovimiento(c.id)}
                    aria-label="Añadir movimiento"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
