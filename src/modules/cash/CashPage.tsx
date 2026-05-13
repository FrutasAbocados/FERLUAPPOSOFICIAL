import { useMemo, useState } from 'react'
import { PageTopbar } from '@/shared/components/PageTopbar'
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
  const puedeEditarCalendario = isAdminFull || isAdminOp
  const [view, setView] = useState<View>('calendario')

  return (
    <div>
      <PageTopbar
        breadcrumb="OPERACIONES · CAJA"
        title="Caja"
        subtitle={`Cierre diario y por repartidor${!puedeEditarCalendario && view === 'calendario' ? ' · Solo lectura' : ''}`}
      />
      <div className="ao-page max-w-5xl py-6 md:py-8">

      <div className="ao-tabbar mb-5 flex w-full overflow-x-auto p-1 md:w-auto">
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

      {view === 'calendario' && <CalendarioView puedeEditar={puedeEditarCalendario} />}
      {view === 'cierre-dia' && puedeCierreDia && <CierreDiaPage />}
      {view === 'estadisticas' && puedeCierreDia && <EstadisticasView />}
      </div>
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
      className={`ao-tab relative px-4 py-2 text-sm font-medium transition ${
        active
          ? 'text-[var(--mint)]'
          : 'text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]'
      }`}
      data-active={active}
    >
      {children}
    </button>
  )
}

function CalendarioView({ puedeEditar }: { puedeEditar: boolean }) {
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
        <div className="ao-card overflow-hidden p-0">
          {/* Cabecera días semana */}
          <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[rgba(255,255,255,.025)]">
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
              const padStart = Array.from({ length: dow }, (_, i) => <div key={`pad-${i}`} className="border-b border-r border-[var(--color-border)]/40 bg-[rgba(255,255,255,.015)]" />)
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
                      ? 'cursor-not-allowed bg-[rgba(255,255,255,.015)] opacity-60'
                      : 'hover:bg-[rgba(255,255,255,.035)]'
                  } ${isHoy ? 'ring-2 ring-inset ring-[var(--color-primary)]' : ''}`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className={`text-sm font-semibold ${isHoy ? 'text-[var(--color-primary)]' : isDom ? 'text-[var(--color-ink-3)]' : 'text-[var(--color-ink)]'}`}>
                      {format(d, 'd')}
                    </span>
                    {tieneCierre && (
                      <span className={`h-1.5 w-1.5 rounded-full ${Number(cierre.resultado) >= 0 ? 'bg-[var(--mint)]' : 'bg-[var(--coral)]'}`} />
                    )}
                  </div>
                  {tieneCierre && (
                    <div className="space-y-0.5 text-[10px] leading-tight">
                      <div className="mono font-medium tabular-nums text-[var(--color-ink)]">{eur(Number(cierre.total_cobrado))}</div>
                      {Number(cierre.total_gastos) > 0 && (
                        <div className="mono tabular-nums text-[var(--coral)]">-{eur(Number(cierre.total_gastos))}</div>
                      )}
                      <div className={`mono tabular-nums font-medium ${Number(cierre.resultado) >= 0 ? 'text-[var(--mint)]' : 'text-[var(--coral)]'}`}>
                        {eur(Number(cierre.resultado))}
                      </div>
                    </div>
                  )}
                  {!tieneCierre && !futuro && (
                    <div className="text-[10px] text-[var(--color-ink-3)]">{puedeEditar ? 'sin cierre' : '—'}</div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Leyenda */}
          <div className="flex items-center gap-4 border-t border-[var(--color-border)] px-3 py-2 text-[10px] text-[var(--color-ink-3)]">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--mint)]" /> resultado positivo
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--coral)]" /> resultado negativo
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
          readOnly={!puedeEditar}
        />
      )}
    </>
  )
}
