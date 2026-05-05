import { useState } from 'react'
import { Activity, Contact, Database } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { BBDDView } from './components/BBDDView'
import { SeguimientoView } from './components/SeguimientoView'

type SubTab = 'bbdd' | 'seguimiento'

const TABS: { key: SubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'bbdd',        label: 'BBDD Clientes',     icon: Database },
  { key: 'seguimiento', label: 'Seguimiento activo', icon: Activity },
]

export function ClientesPage() {
  const [tab, setTab] = useState<SubTab>('seguimiento')
  const [selected, setSelected] = useState<string | null>(null)

  const goToBBDD = (name: string) => {
    setSelected(name)
    setTab('bbdd')
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[var(--color-primary-2)]">
            <Contact className="h-5 w-5" />
            <h1 className="font-display text-xl font-bold text-[var(--color-ink)] md:text-2xl">Clientes</h1>
          </div>
          <p className="text-xs text-[var(--color-ink-3)] md:text-sm">
            BBDD completa con ficha 360° y seguimiento semanal de actividad
          </p>
        </div>
      </header>

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
  )
}
