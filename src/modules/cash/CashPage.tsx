import { useState } from 'react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { useAuth } from '@/shared/auth/useAuth'
import { CierreDiaPage } from './components/CierreDiaPage'
import { EstadisticasView } from './components/EstadisticasView'

type View = 'cierre-dia' | 'estadisticas'

export function CashPage() {
  const { profile } = useAuth()
  const isAdminFull = profile?.role === 'admin_full'
  const isAdminOp = profile?.role === 'admin_op'
  const puedeCierreDia = isAdminFull || isAdminOp
  const [view, setView] = useState<View>('cierre-dia')

  return (
    <div>
      <PageTopbar
        breadcrumb="OPERACIONES · CAJA"
        title="Caja"
        subtitle="Cierre diario por repartidor y estadísticas de productividad"
      />
      <div className="ao-page max-w-5xl py-6 md:py-8">

      <div className="ao-tabbar mb-5 flex w-full overflow-x-auto p-1 md:w-auto">
        {puedeCierreDia && (
          <TabButton active={view === 'cierre-dia'} onClick={() => setView('cierre-dia')}>
            Cierre día
          </TabButton>
        )}
        {puedeCierreDia && (
          <TabButton active={view === 'estadisticas'} onClick={() => setView('estadisticas')}>
            Estadísticas de productividad
          </TabButton>
        )}
      </div>

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
