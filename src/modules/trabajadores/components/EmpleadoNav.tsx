import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Award,
  BarChart3,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  Clock4,
  Gift,
  Handshake,
  MoreHorizontal,
  ShoppingBasket,
  X,
} from 'lucide-react'

export type EmpleadoTab = 'dashboard' | 'puntos' | 'premios' | 'credito' | 'colab' | 'vacaciones' | 'cierre' | 'horas_extras' | 'incidencias'

const ALL_TABS = [
  { k: 'dashboard',   l: 'Inicio',      Icon: BarChart3 },
  { k: 'cierre',      l: 'Mi cierre',   Icon: ClipboardCheck },
  { k: 'incidencias', l: 'Incidencias', Icon: ClipboardList },
  { k: 'puntos',      l: 'Puntos',      Icon: Award },
  { k: 'premios',     l: 'Premios',     Icon: Gift },
  { k: 'vacaciones',  l: 'Vacaciones',  Icon: CalendarOff },
  { k: 'horas_extras', l: 'Horas extras', Icon: Clock4 },
  { k: 'credito',     l: 'Crédito',     Icon: ShoppingBasket },
  { k: 'colab',       l: 'Colab',       Icon: Handshake },
] as const

const MOBILE_PRIMARY_KEYS = ['dashboard', 'cierre', 'incidencias', 'puntos'] as const
const MOBILE_PRIMARY_TABS = ALL_TABS.filter(t =>
  MOBILE_PRIMARY_KEYS.includes(t.k as (typeof MOBILE_PRIMARY_KEYS)[number]),
)
const MOBILE_MORE_TABS = ALL_TABS.filter(t =>
  !MOBILE_PRIMARY_KEYS.includes(t.k as (typeof MOBILE_PRIMARY_KEYS)[number]),
)

export function EmpleadoNav({
  tab,
  setTab,
}: {
  tab: EmpleadoTab
  setTab: (t: EmpleadoTab) => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = MOBILE_MORE_TABS.some(t => t.k === tab)

  const selectTab = (nextTab: EmpleadoTab) => {
    setTab(nextTab)
    setMoreOpen(false)
  }

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
        {MOBILE_PRIMARY_TABS.map(t => (
          <button
            key={t.k}
            type="button"
            onClick={() => selectTab(t.k as EmpleadoTab)}
            className={`emp-bottom-nav-item${tab === t.k ? ' active' : ''}`}
            aria-current={tab === t.k ? 'page' : undefined}
          >
            <t.Icon className="h-[22px] w-[22px]" />
            <span>{t.l}</span>
          </button>
        ))}

        <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className={`emp-bottom-nav-item${moreActive ? ' active' : ''}`}
              aria-label="Abrir más secciones"
              aria-current={moreActive ? 'page' : undefined}
            >
              <MoreHorizontal className="h-[22px] w-[22px]" />
              <span>Más</span>
            </button>
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in" />
            <Dialog.Content className="fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 rounded-[var(--radius-xl)] border border-[var(--line-2)] bg-[var(--panel)] p-3 shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <Dialog.Title className="text-sm font-semibold text-[var(--ink)]">
                  Más secciones
                </Dialog.Title>
                <Dialog.Close
                  className="grid h-9 w-9 place-items-center rounded-[var(--radius)] text-[var(--ink-dim)] hover:bg-white/5 hover:text-[var(--ink)]"
                  aria-label="Cerrar más secciones"
                >
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {MOBILE_MORE_TABS.map(t => (
                  <button
                    key={t.k}
                    type="button"
                    onClick={() => selectTab(t.k as EmpleadoTab)}
                    className={`flex min-h-12 items-center gap-2.5 rounded-[var(--radius)] border px-3 py-2.5 text-left text-sm transition-colors ${
                      tab === t.k
                        ? 'border-[var(--mint)] bg-[var(--mint-glow)] text-[var(--mint)]'
                        : 'border-[var(--line)] bg-white/[.02] text-[var(--ink-dim)] hover:border-[var(--line-2)] hover:text-[var(--ink)]'
                    }`}
                    aria-current={tab === t.k ? 'page' : undefined}
                  >
                    <t.Icon className="h-4 w-4 shrink-0" />
                    <span>{t.l}</span>
                  </button>
                ))}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>
    </>
  )
}
