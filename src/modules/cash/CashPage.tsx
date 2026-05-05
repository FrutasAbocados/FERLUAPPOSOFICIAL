import { useMemo, useState } from 'react'
import { eachDayOfInterval, endOfMonth, format, getDay, isAfter, isSameDay, startOfDay, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
import { MonthHeader } from './components/MonthHeader'
import { KpiBar } from './components/KpiBar'
import { CierreForm } from './components/CierreForm'
import { CierreDiaPage } from './components/CierreDiaPage'
import { EstadisticasView } from './components/EstadisticasView'
import { eurosShort } from '@/shared/lib/format'
import {
  shiftMonth,
  useCierresMes,
  useDeudaAcumHasta,
} from './lib/queries'
import type { Cierre } from './lib/types'

const eur = eurosShort

const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

type View = 'calendario' | 'cierre-dia' | 'estadisticas'

export function CashPage() {
  const { profile } = useAuth()
  const isAdminFull = profile?.role === 'admin_full'
  const isAdminOp = profile?.role === 'admin_op'
  const puedeCierreDia = isAdminFull || isAdminOp
  const [view, setView] = useState<View>('calendario')

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 border-b border-[var(--color-border)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Módulo
        </p>
        <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">
          Caja
        </h1>
        <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
          Cierre diario completo y cierre por repartidor.{' '}
          {!isAdminFull && view === 'calendario' && (
            <span className="text-[var(--color-ink-3)]">(Solo lectura)</span>
          )}
        </p>
      </header>

      <div className="mb-5 flex gap-1 border-b border-[var(--color-border)]">
        <TabButton active={view === 'calendario'} onClick={() => setView('calendario')}>
          Calendario
        </TabButton>
        {puedeCierreDia && (
          <TabButton active={view === 'cierre-dia'} onClick={() => setView('cierre-dia')}>
            Cierre día
          </TabButton>
        )}
        {puedeCierreDia && (
          <TabButton active={view === 'estadisticas'} onClick={() => setView('estadisticas')}>
            Estadísticas
          </TabButton>
        )}
      </div>

      {view === 'calendario' && <CalendarioView isAdminFull={isAdminFull} />}
      {view === 'cierre-dia' && puedeCierreDia && <CierreDiaPage />}
      {view === 'estadisticas' && puedeCierreDia && <EstadisticasView />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`relative -mb-px px-4 py-2 text-sm font-medium transition ${
        active
          ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-ink)]'
          : 'text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]'
      }`}
    >
      {children}
    </button>
  )
}

function CalendarioView({ isAdminFull }: { isAdminFull: boolean }) {
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
    <>
      <div className="mb-4 flex justify-end">
        <MonthHeader
          anchor={anchor}
          onPrev={() => setAnchor((a) => shiftMonth(a, -1))}
          onNext={() => setAnchor((a) => shiftMonth(a, 1))}
          onToday={() => setAnchor(startOfMonth(new Date()))}
        />
      </div>

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
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {/* Cabecera días semana */}
          <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-surface-2,#f3f4ee)]">
            {DOW_LABELS.map(d => (
              <div key={d} className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                {d}
              </div>
            ))}
          </div>

          {/* Grilla calendario */}
          <div className="grid grid-cols-7">
            {(() => {
              // Padding al inicio (lun=0, dom=6)
              const firstDay = days[0]
              const dow = (getDay(firstDay) + 6) % 7  // 0=lun
              const padStart = Array.from({ length: dow }, (_, i) => <div key={`pad-${i}`} className="border-b border-r border-[var(--color-border)]/40 bg-[var(--color-surface-2,#f8fafc)]" />)
              return padStart
            })()}
            {days.map((d) => {
              const iso = format(d, 'yyyy-MM-dd')
              const futuro = isAfter(startOfDay(d), startOfDay(new Date()))
              const cierre = byDate.get(iso)
              const isHoy = isSameDay(d, new Date())
              const tieneCierre = !!cierre
              const isDom = getDay(d) === 0
              return (
                <button
                  key={iso}
                  disabled={futuro}
                  onClick={() => setEditing(iso)}
                  className={`relative flex min-h-[84px] flex-col gap-1 border-b border-r border-[var(--color-border)]/40 p-2 text-left transition ${
                    futuro
                      ? 'cursor-not-allowed bg-[var(--color-surface-2,#f8fafc)] opacity-60'
                      : 'hover:bg-[var(--color-surface-2,#f8fafc)]'
                  } ${isHoy ? 'ring-2 ring-inset ring-[var(--color-primary)]' : ''}`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className={`text-sm font-semibold ${isHoy ? 'text-[var(--color-primary)]' : isDom ? 'text-[var(--color-ink-3)]' : 'text-[var(--color-ink)]'}`}>
                      {format(d, 'd')}
                    </span>
                    {tieneCierre && (
                      <span className={`h-1.5 w-1.5 rounded-full ${Number(cierre.resultado) >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    )}
                  </div>
                  {tieneCierre && (
                    <div className="space-y-0.5 text-[10px] leading-tight">
                      <div className="font-medium tabular-nums text-[var(--color-ink)]">{eur(Number(cierre.total_cobrado))}</div>
                      {Number(cierre.total_gastos) > 0 && (
                        <div className="tabular-nums text-red-600">-{eur(Number(cierre.total_gastos))}</div>
                      )}
                      <div className={`tabular-nums font-medium ${Number(cierre.resultado) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {eur(Number(cierre.resultado))}
                      </div>
                    </div>
                  )}
                  {!tieneCierre && !futuro && (
                    <div className="text-[10px] text-[var(--color-ink-3)]">{isAdminFull ? 'sin cierre' : '—'}</div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Leyenda */}
          <div className="flex items-center gap-4 border-t border-[var(--color-border)] px-3 py-2 text-[10px] text-[var(--color-ink-3)]">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> resultado positivo
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> resultado negativo
            </span>
            <span className="ml-auto">{format(anchor, "LLLL yyyy", { locale: es })}</span>
          </div>
        </div>
      )}

      {editing && (
        <CierreForm
          fecha={editing}
          cierre={editingCierre ?? null}
          onClose={() => setEditing(null)}
          readOnly={!isAdminFull}
        />
      )}
    </>
  )
}
