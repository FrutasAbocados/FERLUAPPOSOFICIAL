import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Banknote,
  Bot,
  CheckSquare,
  ChevronRight,
  HandCoins,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Users,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
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
  { key: 'agente',  label: 'Agente', to: '/agente', icon: Bot },
  { key: 'pedidos_wa', label: 'Pedidos', to: '/pedidos-wa', icon: MessageSquare },
  { key: 'cash', label: 'Caja', to: '/cash', icon: Banknote },
  { key: 'cobros', label: 'Cobros', to: '/cobros', icon: HandCoins },
  { key: 'sueldos', label: 'Sueldos', to: '/sueldos', icon: Wallet },
]

// Sub-grupo "Equipo" — agrupa los módulos relacionados con personal
const EQUIPO: ModuleNav[] = [
  { key: 'trabajadores', label: 'Trabajadores', to: '/trabajadores', icon: CheckSquare },
  { key: 'bbdd_trabajadores', label: 'BBDD trabajadores', to: '/bbdd-trabajadores', icon: Users },
]

export function AppShell() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const role = profile?.role
  const visible = MODULES.filter((m) => role && canAccess(m.key, role))
  const equipo  = EQUIPO.filter((m) => role && canAccess(m.key, role))
  const [equipoOpen, setEquipoOpen] = useState(false)

  // Cierra drawer al navegar
  useEffect(() => { setEquipoOpen(false) }, [location.pathname])
  // Cierra con Escape
  useEffect(() => {
    if (!equipoOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEquipoOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [equipoOpen])

  const isEquipoActive = equipo.some(m => location.pathname.startsWith(m.to))

  return (
    <div className="flex h-full overflow-x-hidden">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] md:flex">
        <Link to="/" className="flex h-16 items-center gap-2 border-b border-[var(--color-border)] px-5 transition hover:bg-[var(--color-surface-2,#f8fafc)]">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white">
            <Menu className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-sm font-bold leading-tight text-[var(--color-ink)]">
              Abocados OS
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
              Centro de control
            </div>
          </div>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)] font-semibold'
                  : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
              )
            }
          >
            <Home className="h-4 w-4" />
            Dashboard
          </NavLink>

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

          {equipo.length > 0 && (
            <div className="pt-2">
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                Equipo
              </div>
              {equipo.map((m) => (
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
            </div>
          )}
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
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header móvil */}
        <header className="flex h-14 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 md:hidden">
          <Link to="/" className="font-display text-base font-bold text-[var(--color-ink)]">
            Abocados
          </Link>
          <div className="flex items-center gap-1">
            {equipo.length > 0 && (
              <button
                type="button"
                onClick={() => setEquipoOpen(true)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  isEquipoActive
                    ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                    : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
                )}
                aria-label="Abrir menú equipo"
              >
                <UsersRound className="h-4 w-4" />
                Equipo
              </button>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md p-2 text-[var(--color-ink-2)]"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <Outlet key={location.pathname} />
        </div>

        {/* Bottom nav móvil — solo MODULES principales (Equipo va en header) */}
        {visible.length > 0 && (
          <nav
            className="fixed bottom-0 left-0 right-0 z-30 grid border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
            style={{ gridTemplateColumns: `repeat(${visible.length + 1}, 1fr)` }}>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  'flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] uppercase tracking-wider transition-colors',
                  isActive
                    ? 'text-[var(--color-primary)] font-bold'
                    : 'text-[var(--color-ink-3)]',
                )
              }
            >
              <Home className="h-5 w-5 shrink-0" />
              <span className="w-full truncate text-center">Inicio</span>
            </NavLink>
            {visible.map((m) => (
              <NavLink
                key={m.key}
                to={m.to}
                className={({ isActive }) =>
                  cn(
                    'flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] uppercase tracking-wider transition-colors',
                    isActive
                      ? 'text-[var(--color-primary)] font-bold'
                      : 'text-[var(--color-ink-3)]',
                  )
                }
              >
                <m.icon className="h-5 w-5 shrink-0" />
                <span className="w-full truncate text-center">{m.label}</span>
              </NavLink>
            ))}
          </nav>
        )}

        {/* Drawer Equipo (móvil) */}
        {equipoOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setEquipoOpen(false)}
            aria-hidden
          >
            <div
              className="absolute right-0 top-0 h-full w-72 max-w-[85%] bg-[var(--color-surface)] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                  <UsersRound className="h-4 w-4 text-[var(--color-primary-2)]" />
                  Equipo
                </div>
                <button
                  type="button"
                  onClick={() => setEquipoOpen(false)}
                  className="rounded-md p-1.5 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                  aria-label="Cerrar menú equipo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="space-y-1 p-3">
                {equipo.map((m) => (
                  <NavLink
                    key={m.key}
                    to={m.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-3 text-sm transition-colors',
                        isActive
                          ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)] font-semibold'
                          : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
                      )
                    }
                  >
                    <span className="flex items-center gap-3">
                      <m.icon className="h-4 w-4" />
                      {m.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-[var(--color-ink-3)]" />
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
