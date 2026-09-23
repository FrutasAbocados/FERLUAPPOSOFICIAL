import { useSearchParams } from 'react-router-dom'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { cn } from '@/shared/lib/utils'
import { useCategorias, useGastosFijos } from './lib/queries'
import { FijosView } from './components/FijosView'

type Tab = 'fijos' | 'variables'
const TABS: { key: Tab; label: string }[] = [
  { key: 'fijos', label: 'Gastos fijos' },
  { key: 'variables', label: 'Gastos variables' },
]

export function GastosPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'variables' ? 'variables' : 'fijos'
  const fijos = useGastosFijos()
  const categorias = useCategorias()

  return (
    <div>
      <PageTopbar
        breadcrumb="EMPRESA · GASTOS"
        title="Gastos"
        subtitle="Coste fijo mensual estimado de la empresa. Importes con IVA incluido."
      />
      <div className="ao-page py-4 md:py-6">
        <div className="mb-4 flex gap-1 border-b border-[var(--line)]">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setParams(t.key === 'fijos' ? {} : { tab: t.key }, { replace: true })}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
                tab === t.key ? 'border-[var(--mint)] text-[var(--ink)]' : 'border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'fijos' && (
          fijos.isLoading || categorias.isLoading ? (
            <p className="text-sm text-[var(--ink-dim)]">Cargando…</p>
          ) : fijos.error || categorias.error ? (
            <p className="text-sm text-[var(--coral)]">No se pudieron cargar los gastos.</p>
          ) : (
            <FijosView gastos={fijos.data ?? []} categorias={categorias.data ?? []} />
          )
        )}

        {tab === 'variables' && (
          <div className="ao-card p-4 text-sm text-[var(--ink-dim)]">
            Próximamente. Los gastos variables ya se registran desde el cierre de Caja y aparecerán aquí.
          </div>
        )}
      </div>
    </div>
  )
}
