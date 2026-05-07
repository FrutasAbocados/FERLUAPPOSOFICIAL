import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Award, BarChart3, BookCheck, CalendarClock, CalendarDays, CalendarOff, Clock4, Construction, Fingerprint, ShoppingBasket, Sparkles } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useAuth } from '@/shared/auth/useAuth'
import { TareasPage } from '@/modules/tareas/TareasPage'
import { TurnosPage } from '@/modules/turnos/TurnosPage'
import { CreditoView } from './components/CreditoView'
import { VacacionesView } from './components/VacacionesView'
import { SabadosView } from './components/SabadosView'
import { PuntosView } from './components/PuntosView'
import { DashboardView } from './components/DashboardView'
import { HorasExtrasView } from './components/HorasExtrasView'
import { RuletaAdminView } from './components/RuletaAdminView'
import { FichajesView } from './components/FichajesView'

type Tab = 'dashboard' | 'tareas' | 'puntos' | 'vacaciones' | 'sabados' | 'credito' | 'horas_extras' | 'fichajes' | 'turnos' | 'ruleta' | 'productividad'

const TABS: Array<{ k: Tab; l: string; Icon: typeof Award }> = [
  { k: 'dashboard',     l: 'Dashboard',       Icon: BarChart3 },
  { k: 'tareas',        l: 'Tareas',          Icon: BookCheck },
  { k: 'puntos',        l: 'Puntos',          Icon: Award },
  { k: 'vacaciones',    l: 'Vacaciones',      Icon: CalendarOff },
  { k: 'sabados',       l: 'Sábados',         Icon: CalendarDays },
  { k: 'credito',       l: 'Crédito frutas',  Icon: ShoppingBasket },
  { k: 'horas_extras',  l: 'Horas extras',    Icon: Clock4 },
  { k: 'fichajes',      l: 'Fichajes',        Icon: Fingerprint },
  { k: 'turnos',        l: 'Turnos',          Icon: CalendarClock },
  { k: 'ruleta',        l: 'Ruleta',          Icon: Sparkles },
  { k: 'productividad', l: 'Plus productividad', Icon: Construction },
]

const TABS_EMPLEADO: Tab[] = ['dashboard', 'tareas', 'puntos', 'vacaciones', 'sabados', 'horas_extras', 'turnos']

const isTab = (v: string | null | undefined): v is Tab =>
  !!v && TABS.some(t => t.k === v)

export function TrabajadoresOpPage() {
  const { profile } = useAuth()
  const role = profile?.role
  const tabsVisibles = useMemo(
    () => role === 'empleado' ? TABS.filter(t => TABS_EMPLEADO.includes(t.k)) : TABS,
    [role],
  )
  const [searchParams] = useSearchParams()
  const initialTab: Tab = isTab(searchParams.get('tab')) ? (searchParams.get('tab') as Tab) : 'dashboard'
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <div>
      {/* Tabs */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 md:px-6">
        <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
          {tabsVisibles.map(t => (
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

      {tab === 'dashboard' && <DashboardView />}
      {tab === 'tareas' && <TareasPage />}
      {tab === 'puntos' && <PuntosView />}
      {tab === 'vacaciones' && <VacacionesView />}
      {tab === 'sabados' && <SabadosView />}
      {tab === 'credito' && <CreditoView />}
      {tab === 'horas_extras' && <HorasExtrasView />}
      {tab === 'fichajes' && <FichajesView />}
      {tab === 'turnos' && <TurnosPage />}
      {tab === 'ruleta' && <RuletaAdminView />}
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
