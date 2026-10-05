import { useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, Database, HeartHandshake } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { BBDDView } from './components/BBDDView'
import { ProgramaFidelizacionView } from './components/ProgramaFidelizacionView'
import { SeguimientoView } from './components/SeguimientoView'
import {
  seguimientoV2QueryKey,
  fetchClientesSeguimientoV2,
} from './lib/hooks'

type SubTab = 'bbdd' | 'seguimiento' | 'programa'

const TABS: { key: SubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'bbdd',        label: 'BBDD Clientes',     icon: Database },
  { key: 'seguimiento', label: 'Seguimiento activo', icon: Activity },
  { key: 'programa',    label: 'Programa fidelización', icon: HeartHandshake },
]

const isSubTab = (v: string | null): v is SubTab =>
  v === 'bbdd' || v === 'seguimiento' || v === 'programa'

export function ClientesPage() {
  // Pestaña y ficha viven en la URL: abrir una ficha añade una entrada al
  // historial, así el gesto/botón atrás vuelve a la BBDD en vez de salir.
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const tabParam = searchParams.get('tab')
  const tab: SubTab = isSubTab(tabParam) ? tabParam : 'seguimiento'
  const selected = tab === 'bbdd' ? searchParams.get('cliente') : null
  const qc = useQueryClient()

  const setTab = (t: SubTab) => {
    setSearchParams({ tab: t }, { replace: true })
  }

  const setSelected = (name: string | null) => {
    if (name) {
      // Cambiar de cliente con la ficha abierta no apila más entradas.
      setSearchParams({ tab: 'bbdd', cliente: name }, { replace: !!selected, state: { ficha: true } })
    } else if ((location.state as { ficha?: boolean } | null)?.ficha) {
      navigate(-1)
    } else {
      setSearchParams({ tab: 'bbdd' }, { replace: true })
    }
  }

  // Prefetch solo el tab inicial. La BBDD dispara una RPC analítica pesada y se
  // carga bajo demanda al abrir su pestaña.
  useEffect(() => {
    qc.prefetchQuery({
      queryKey: seguimientoV2QueryKey(90),
      queryFn: () => fetchClientesSeguimientoV2(90),
      staleTime: 3 * 60_000,
    })
  }, [qc])

  const goToBBDD = (name: string) => {
    setSearchParams({ tab: 'bbdd', cliente: name }, { state: { ficha: true } })
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
        {tab === 'programa'    && <ProgramaFidelizacionView />}
      </section>
      </div>
    </div>
  )
}
