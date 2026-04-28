import { useMemo, useState } from 'react'
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/shared/auth/AuthContext'
import { MonthHeader } from './components/MonthHeader'
import { KpiBar } from './components/KpiBar'
import { DayCard } from './components/DayCard'
import { CierreForm } from './components/CierreForm'
import {
  shiftMonth,
  useCierresMes,
  useDeudaAcumHasta,
} from './lib/queries'
import type { Cierre } from './lib/types'

export function CashPage() {
  const { profile } = useAuth()
  const isAdminFull = profile?.role === 'admin_full'
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()))
  const [editing, setEditing] = useState<string | null>(null)

  const cierres = useCierresMes(anchor)
  const deuda = useDeudaAcumHasta(anchor)

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(anchor), end: endOfMonth(anchor) }),
    [anchor],
  )

  const byDate = useMemo(() => {
    const m = new Map<string, Cierre>()
    for (const c of cierres.data ?? []) m.set(c.fecha, c)
    return m
  }, [cierres.data])

  const totals = useMemo(() => {
    const list = cierres.data ?? []
    return {
      cobrado: list.reduce((s, c) => s + Number(c.total_cobrado), 0),
      gastos: list.reduce((s, c) => s + Number(c.total_gastos), 0),
      resultado: list.reduce((s, c) => s + Number(c.resultado), 0),
    }
  }, [cierres.data])

  const editingCierre = editing ? byDate.get(editing) ?? null : null

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
            Módulo
          </p>
          <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">
            Caja
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
            Cierre diario completo: cobros, gastos, deuda, operativa.{' '}
            {!isAdminFull && (
              <span className="text-[var(--color-ink-3)]">(Solo lectura)</span>
            )}
          </p>
        </div>
        <MonthHeader
          anchor={anchor}
          onPrev={() => setAnchor((a) => shiftMonth(a, -1))}
          onNext={() => setAnchor((a) => shiftMonth(a, 1))}
          onToday={() => setAnchor(startOfMonth(new Date()))}
        />
      </header>

      <div className="mb-5">
        <KpiBar
          cobrado={totals.cobrado}
          gastos={totals.gastos}
          resultado={totals.resultado}
          deudaAcum={deuda.data ?? 0}
        />
      </div>

      {cierres.error && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
          Error: {(cierres.error as Error).message}
        </div>
      )}

      {cierres.isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-sm text-[var(--color-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando cierres del mes…
        </div>
      ) : (
        <div className="space-y-2">
          {days.map((d) => {
            const iso = format(d, 'yyyy-MM-dd')
            return (
              <DayCard
                key={iso}
                date={d}
                cierre={byDate.get(iso)}
                onClick={isAdminFull ? () => setEditing(iso) : undefined}
              />
            )
          })}
        </div>
      )}

      {isAdminFull && editing && (
        <CierreForm
          fecha={editing}
          cierre={editingCierre ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
