import { Award, BarChart3, CalendarOff, Handshake, ShoppingBasket } from 'lucide-react'

export type EmpleadoTab = 'dashboard' | 'puntos' | 'credito' | 'colab' | 'vacaciones'

const ALL_TABS = [
  { k: 'dashboard',  l: 'Inicio',      Icon: BarChart3 },
  { k: 'puntos',     l: 'Puntos',      Icon: Award },
  { k: 'vacaciones', l: 'Vacaciones',  Icon: CalendarOff },
  { k: 'credito',    l: 'Crédito',     Icon: ShoppingBasket },
  { k: 'colab',      l: 'Colab',       Icon: Handshake },
] as const

export function EmpleadoNav({
  tab,
  setTab,
}: {
  tab: EmpleadoTab
  setTab: (t: EmpleadoTab) => void
}) {
  return (
    <>
      {/* Desktop: pill tab bar */}
      <div className="emp-desktop-nav hidden md:block">
        <div className="ao-tabbar max-w-full overflow-x-auto no-scrollbar">
          {ALL_TABS.map(t => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k as EmpleadoTab)}
              data-active={tab === t.k}
              className={tab === t.k ? 'ao-tab ao-tab-active' : 'ao-tab'}
            >
              <t.Icon className="h-3.5 w-3.5" />
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: fixed bottom navigation */}
      <nav className="emp-bottom-nav md:hidden" aria-label="Navegación personal">
        {ALL_TABS.map(t => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k as EmpleadoTab)}
            className={`emp-bottom-nav-item${tab === t.k ? ' active' : ''}`}
            aria-current={tab === t.k ? 'page' : undefined}
          >
            <t.Icon className="h-[22px] w-[22px]" />
            <span>{t.l}</span>
          </button>
        ))}
      </nav>
    </>
  )
}
