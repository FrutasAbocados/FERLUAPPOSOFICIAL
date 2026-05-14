import { useEffect, useState } from 'react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, Database } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { BBDDView } from './components/BBDDView'
import { SeguimientoView } from './components/SeguimientoView'
import {
  clientesSeguimientoQueryKey,
  fetchClientesSeguimiento,
} from './lib/hooks'

type SubTab = 'bbdd' | 'seguimiento'

const TABS: { key: SubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'bbdd',        label: 'BBDD Clientes',     icon: Database },
  { key: 'seguimiento', label: 'Seguimiento activo', icon: Activity },
]

export function ClientesPage() {
  const [tab, setTab] = useState<SubTab>('seguimiento')
  const [selected, setSelected] = useState<string | null>(null)
  const qc = useQueryClient()

  // Prefetch solo el tab inicial. La BBDD dispara una RPC analítica pesada y se
  // carga bajo demanda al abrir su pestaña.
  useEffect(() => {
    qc.prefetchQuery({
      queryKey: clientesSeguimientoQueryKey(7, 90),
      queryFn: () => fetchClientesSeguimiento(7, 90),
      staleTime: 5 * 60_000,
    })
  }, [qc])

  const goToBBDD = (name: string) => {
    setSelected(name)
    setTab('bbdd')
  }

  return (
    <div>
      <PageTopbar
        breadcrumb="OPERACIONES · CLIENTES"
        title="Clientes"
        subtitle="BBDD completa con ficha 360° y seguimiento semanal de actividad"
      />
      <div className="ao-page max-w-7xl space-y-4 py-6 md:py-8">

      <nav className="ao-tabbar flex w-full overflow-x-auto p-1 md:w-auto">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'ao-tab flex shrink-0 items-center gap-1.5',
                active
                  ? 'font-semibold'
                  : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
              )}
              data-active={active}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </nav>

      <section>
        {tab === 'bbdd'        && <BBDDView selected={selected} onSelectChange={setSelected} />}
        {tab === 'seguimiento' && <SeguimientoView onSelect={goToBBDD} />}
      </section>
      </div>
    </div>
  )
}
