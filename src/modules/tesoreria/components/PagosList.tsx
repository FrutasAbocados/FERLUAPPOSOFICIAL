import { Check, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { euros, fmtFecha, isAtrasado } from '../lib/format'
import type { Pago, PagoEstado } from '../lib/types'

type Props = {
  pagos: Pago[]
  estado: PagoEstado | 'todos'
  isAdminFull: boolean
  onChangeEstado: (estado: PagoEstado | 'todos') => void
  onAddPago: () => void
  onMarcarPagado: (pago: Pago) => void
  onCancelar: (pago: Pago) => void
  onDelete: (pago: Pago) => void
}

const FILTROS: { key: PagoEstado | 'todos'; label: string }[] = [
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'pagado', label: 'Pagados' },
  { key: 'cancelado', label: 'Cancelados' },
  { key: 'todos', label: 'Todos' },
]

export function PagosList({
  pagos,
  estado,
  isAdminFull,
  onChangeEstado,
  onAddPago,
  onMarcarPagado,
  onCancelar,
  onDelete,
}: Props) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
          Pagos a proveedores
        </h2>
        {isAdminFull && (
          <Button variant="outline" size="sm" onClick={onAddPago} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Nuevo pago
          </Button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => onChangeEstado(f.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
              estado === f.key
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {pagos.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-center text-sm text-[var(--color-ink-3)]">
          Sin pagos {estado !== 'todos' ? `con estado "${estado}"` : ''}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {pagos.map((p, i) => {
            const atrasado = p.estado === 'pendiente' && isAtrasado(p.fecha_vencimiento)
            return (
              <div
                key={p.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 px-3 py-3 md:flex-nowrap',
                  i > 0 && 'border-t border-[var(--color-border)]',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-sm font-bold text-[var(--color-ink)]">
                    {p.proveedor}
                  </div>
                  {p.concepto && (
                    <div className="truncate text-xs text-[var(--color-ink-2)]">
                      {p.concepto}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-display text-sm font-bold tabular-nums text-[var(--color-ink)]">
                    {euros(p.importe)}
                  </div>
                  <div
                    className={cn(
                      'text-[10px] uppercase tracking-wider',
                      atrasado
                        ? 'font-bold text-[var(--color-danger)]'
                        : 'text-[var(--color-ink-3)]',
                    )}
                  >
                    {atrasado ? 'Atrasado · ' : 'Vence '}
                    {fmtFecha(p.fecha_vencimiento)}
                  </div>
                </div>
                <EstadoBadge estado={p.estado} atrasado={atrasado} />
                {isAdminFull && (
                  <div className="flex shrink-0 gap-1">
                    {p.estado === 'pendiente' && (
                      <>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => onMarcarPagado(p)}
                          aria-label="Marcar pagado"
                          title="Marcar pagado"
                        >
                          <Check className="h-4 w-4 text-[var(--color-success)]" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onCancelar(p)}
                          aria-label="Cancelar"
                          title="Cancelar"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDelete(p)}
                      aria-label="Eliminar"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function EstadoBadge({ estado, atrasado }: { estado: PagoEstado; atrasado: boolean }) {
  if (estado === 'pagado') {
    return (
      <span className="rounded-full bg-[var(--color-success-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-success)]">
        Pagado
      </span>
    )
  }
  if (estado === 'cancelado') {
    return (
      <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
        Cancelado
      </span>
    )
  }
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        atrasado
          ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
          : 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]',
      )}
    >
      {atrasado ? 'Atrasado' : 'Pendiente'}
    </span>
  )
}
