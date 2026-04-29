import { useState } from 'react'
import { Award, BookCheck, CalendarOff, Construction, ShoppingBasket } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { TareasPage } from '@/modules/tareas/TareasPage'

type Tab = 'tareas' | 'puntos' | 'vacaciones' | 'credito' | 'productividad'

const TABS: Array<{ k: Tab; l: string; Icon: typeof Award }> = [
  { k: 'tareas',        l: 'Tareas',          Icon: BookCheck },
  { k: 'puntos',        l: 'Puntos',          Icon: Award },
  { k: 'vacaciones',    l: 'Vacaciones',      Icon: CalendarOff },
  { k: 'credito',       l: 'Crédito frutas',  Icon: ShoppingBasket },
  { k: 'productividad', l: 'Plus productividad', Icon: Construction },
]

export function TrabajadoresOpPage() {
  const [tab, setTab] = useState<Tab>('tareas')

  return (
    <div>
      {/* Tabs */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 md:px-6">
        <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
          {TABS.map(t => (
            <Button
              key={t.k}
              size="sm"
              variant={tab === t.k ? 'primary' : 'ghost'}
              onClick={() => setTab(t.k)}
              className="shrink-0"
            >
              <t.Icon className="mr-1 h-4 w-4" /> {t.l}
            </Button>
          ))}
        </div>
      </div>

      {tab === 'tareas' && <TareasPage />}
      {tab === 'puntos' && <Placeholder titulo="Puntos" descripcion="Sistema de puntos / incentivos por trabajador. Por implementar." />}
      {tab === 'vacaciones' && <Placeholder titulo="Vacaciones" descripcion="Registro y conteo de días de vacaciones por trabajador. Por implementar." />}
      {tab === 'credito' && <Placeholder titulo="Crédito de frutas y verduras" descripcion="Registro de productos que los trabajadores se llevan a casa fiados. Por implementar." />}
      {tab === 'productividad' && <Placeholder titulo="Plus productividad" descripcion="Cálculo de plus por productividad según métricas." comingSoon />}
    </div>
  )
}

function Placeholder({ titulo, descripcion, comingSoon }: { titulo: string; descripcion: string; comingSoon?: boolean }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-center md:px-6 md:py-20">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary-soft)]">
        <Construction className="h-7 w-7 text-[var(--color-primary-2)]" />
      </div>
      <h2 className="font-display text-2xl font-bold text-[var(--color-ink)]">{titulo}</h2>
      <p className="mt-2 text-sm text-[var(--color-ink-2)]">{descripcion}</p>
      {comingSoon && (
        <span className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Coming soon</span>
      )}
    </div>
  )
}
