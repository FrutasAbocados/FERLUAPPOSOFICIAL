import { useEffect, useState } from 'react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, Contact, Database } from 'lucide-react'
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { cn } from '@/shared/lib/utils'
import { BBDDView } from './components/BBDDView'
import { SeguimientoView } from './components/SeguimientoView'
import {
  clientesBBDDQueryKey,
  clientesSeguimientoQueryKey,
  fetchClientesBBDD,
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

  // Prefetch ambos tabs al montar — así el otro tab abre instantáneo.
  useEffect(() => {
    const today = new Date()
    const from = format(startOfMonth(subMonths(today, 2)), 'yyyy-MM-dd')
    const to   = format(endOfMonth(today), 'yyyy-MM-dd')
    qc.prefetchQuery({
      queryKey: clientesBBDDQueryKey(from, to),
      queryFn: () => fetchClientesBBDD(from, to),
      staleTime: 5 * 60_000,
    })
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
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">

      <nav className="flex gap-1 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
              )}
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
