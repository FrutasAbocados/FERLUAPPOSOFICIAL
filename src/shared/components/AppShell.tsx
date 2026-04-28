import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Banknote,
  CheckSquare,
  CalendarDays,
  Wallet,
  HandCoins,
  LogOut,
  Menu,
} from 'lucide-react'
import { useAuth } from '@/shared/auth/AuthContext'
import { canAccess, type ModuleKey } from '@/shared/types'
import { cn } from '@/shared/lib/utils'

type ModuleNav = {
  key: ModuleKey
  label: string
  to: string
  icon: React.ComponentType<{ className?: string }>
}

const MODULES: ModuleNav[] = [
  { key: 'manager', label: 'Manager', to: '/manager', icon: BarChart3 },
  { key: 'cash', label: 'Caja', to: '/cash', icon: Banknote },
  { key: 'tareas', label: 'Tareas', to: '/tareas', icon: CheckSquare },
  { key: 'turnos', label: 'Turnos', to: '/turnos', icon: CalendarDays },
  { key: 'tesoreria', label: 'Tesorería', to: '/tesoreria', icon: Wallet },
  { key: 'cobros', label: 'Cobros', to: '/cobros', icon: HandCoins },
]

export function AppShell() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const role = profile?.role
  const visible = MODULES.filter((m) => role && canAccess(m.key, role))

  return (
    <div className="flex h-full">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-[var(--color-border)] px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white">
            <Menu className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-sm font-bold leading-tight text-[var(--color-ink)]">
              Abocados OS
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
              Frutas Abocados
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {visible.map((m) => (
            <NavLink
              key={m.key}
              to={m.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)] font-semibold'
                    : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
                )
              }
            >
              <m.icon className="h-4 w-4" />
              {m.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[var(--color-border)] p-3">
          <div className="mb-2 px-3 text-xs">
            <div className="truncate font-medium text-[var(--color-ink)]">
              {profile?.display_name ?? '—'}
            </div>
            <div className="truncate text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
              {profile?.role ?? '—'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex flex-1 flex-col">
        {/* Header móvil */}
        <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 md:hidden">
          <Link to="/" className="font-display text-base font-bold text-[var(--color-ink)]">
            Abocados
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md p-2 text-[var(--color-ink-2)]"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Outlet key={location.pathname} />
        </div>

        {/* Bottom nav móvil */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 grid border-t border-[var(--color-border)] bg-[var(--color-surface)] md:hidden"
             style={{ gridTemplateColumns: `repeat(${visible.length || 1}, 1fr)` }}>
          {visible.map((m) => (
            <NavLink
              key={m.key}
              to={m.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 py-2 text-[10px] uppercase tracking-wider transition-colors',
                  isActive
                    ? 'text-[var(--color-primary)] font-bold'
                    : 'text-[var(--color-ink-3)]',
                )
              }
            >
              <m.icon className="h-5 w-5" />
              {m.label}
            </NavLink>
          ))}
        </nav>
      </main>
    </div>
  )
}
