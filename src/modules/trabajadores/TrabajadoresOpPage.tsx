import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Award, BarChart3, BookCheck, CalendarClock, CalendarDays, CalendarOff, Clock4, Construction, Fingerprint, ShoppingBasket, Sparkles } from 'lucide-react'
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
import { EmpleadoNav, type EmpleadoTab } from './components/EmpleadoNav'
import { EmpleadoPuntosView } from './components/EmpleadoPuntosView'
import { EmpleadoCreditoView } from './components/EmpleadoCreditoView'
import { EmpleadoColabView } from './components/EmpleadoColabView'
import { useEmpleadoPropio } from './lib/useEmpleadoPropio'

type Tab = 'dashboard' | 'tareas' | 'puntos' | 'vacaciones' | 'sabados' | 'credito' | 'horas_extras' | 'fichajes' | 'turnos' | 'ruleta' | 'productividad' | 'colab'

const TABS: Array<{ k: Tab; l: string; Icon: typeof Award }> = [
  { k: 'dashboard',     l: 'Dashboard',          Icon: BarChart3 },
  { k: 'tareas',        l: 'Tareas',             Icon: BookCheck },
  { k: 'puntos',        l: 'Puntos',             Icon: Award },
  { k: 'vacaciones',    l: 'Vacaciones',         Icon: CalendarOff },
  { k: 'sabados',       l: 'Sábados',            Icon: CalendarDays },
  { k: 'credito',       l: 'Crédito frutas',     Icon: ShoppingBasket },
  { k: 'horas_extras',  l: 'Horas extras',       Icon: Clock4 },
  { k: 'fichajes',      l: 'Fichajes',           Icon: Fingerprint },
  { k: 'turnos',        l: 'Turnos',             Icon: CalendarClock },
  { k: 'ruleta',        l: 'Ruleta',             Icon: Sparkles },
  { k: 'productividad', l: 'Plus productividad', Icon: Construction },
]

const TABS_EMPLEADO: Tab[] = ['dashboard', 'puntos', 'credito', 'colab']
const TAB_KEYS = new Set<string>([...TABS.map(t => t.k), ...TABS_EMPLEADO])

const isTab = (v: string | null | undefined): v is Tab =>
  !!v && TAB_KEYS.has(v)

const isEmpleadoTab = (v: Tab): v is EmpleadoTab =>
  TABS_EMPLEADO.includes(v)

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
  const previewEmpleado = role === 'admin_full' && searchParams.get('preview') === 'empleado'

  /* ── Vista empleado: nav adaptada + contenido ── */
  if (role === 'empleado' || previewEmpleado) {
    return <EmpleadoContent tab={tab} setTab={setTab} isEmpleadoTab={isEmpleadoTab} />
  }

  /* ── Vista admin/responsable: tab bar estándar ── */
  return (
    <div>
      <div className="border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 md:px-6">
        <div className="ao-tabbar max-w-full overflow-x-auto no-scrollbar">
          {tabsVisibles.map(t => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              data-active={tab === t.k}
              className={tab === t.k ? 'ao-tab ao-tab-active' : 'ao-tab'}
            >
              <t.Icon className="h-3.5 w-3.5" /> {t.l}
            </button>
          ))}
        </div>
      </div>

      {tab === 'dashboard'    && <DashboardView />}
      {tab === 'tareas'       && <TareasPage />}
      {tab === 'puntos'       && <PuntosView />}
      {tab === 'vacaciones'   && <VacacionesView />}
      {tab === 'sabados'      && <SabadosView />}
      {tab === 'credito'      && <CreditoView />}
      {tab === 'horas_extras' && <HorasExtrasView />}
      {tab === 'fichajes'     && <FichajesView />}
      {tab === 'turnos'       && <TurnosPage />}
      {tab === 'ruleta'       && <RuletaAdminView />}
      {tab === 'productividad' && <Placeholder titulo="Plus productividad" descripcion="Cálculo de plus por productividad según métricas." comingSoon />}
    </div>
  )
}

function EmpleadoContent({
  tab, setTab, isEmpleadoTab,
}: {
  tab: Tab
  setTab: (t: Tab) => void
  isEmpleadoTab: (t: Tab) => t is EmpleadoTab
}) {
  const { data: empleado, isLoading } = useEmpleadoPropio()
  const empTab = isEmpleadoTab(tab) ? tab : 'dashboard'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[var(--color-ink-3)]">
        Cargando…
      </div>
    )
  }

  return (
    <div>
      <EmpleadoNav tab={empTab} setTab={(t) => setTab(t)} />

      {empTab === 'dashboard'    && <DashboardView modoEmpleado />}
      {empTab === 'puntos'       && (empleado ? <EmpleadoPuntosView empleado={empleado} /> : <DashboardView modoEmpleado />)}
      {empTab === 'credito'      && (empleado ? <EmpleadoCreditoView empleado={empleado} /> : <DashboardView modoEmpleado />)}
      {empTab === 'colab'        && (empleado ? <EmpleadoColabView empleado={empleado} /> : <DashboardView modoEmpleado />)}
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
        <span className="mt-3 inline-block rounded-full bg-[oklch(92%_.08_82_/_0.85)] px-3 py-1 text-xs font-semibold text-[var(--color-primary)] dark:bg-[oklch(28%_.08_72_/_0.42)]">Coming soon</span>
      )}
    </div>
  )
}
