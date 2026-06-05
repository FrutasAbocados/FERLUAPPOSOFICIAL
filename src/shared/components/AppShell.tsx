import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { prefetchManagerResumen } from '@/modules/manager/lib/queries'
import {
  BarChart3,
  Banknote,
  Bot,
  CheckSquare,
  ChevronRight,
  Command,
  Contact,
  FileText,
  HandCoins,
  Home,
  LogOut,
  MessageSquare,
  Receipt,
  ScrollText,
  Tags,
  Users,
  UsersRound,
  Vault,
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
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
}

const MODULES: ModuleNav[] = [
  { key: 'manager',    label: 'Manager',  to: '/manager',    icon: BarChart3 },
  { key: 'agente',     label: 'Agente',   to: '/agente',     icon: Bot },
  { key: 'pedidos_wa', label: 'Pedidos',  to: '/pedidos-wa', icon: MessageSquare },
  { key: 'cash',       label: 'Caja',     to: '/cash',       icon: Banknote },
  { key: 'clientes',   label: 'Clientes', to: '/clientes',   icon: Contact },
  { key: 'cobros',     label: 'Cobros',     to: '/cobros',     icon: HandCoins },
  { key: 'gastos',     label: 'Gastos',     to: '/gastos',     icon: Receipt },
  { key: 'tesoreria',  label: 'Tesorería',  to: '/tesoreria',  icon: Vault },
  { key: 'listado_precios', label: 'Listado Precios', to: '/listado-precios', icon: Tags },
]

const EQUIPO: ModuleNav[] = [
  { key: 'trabajadores',      label: 'Trabajadores', to: '/trabajadores',      icon: CheckSquare },
  { key: 'bbdd_trabajadores', label: 'BBDD',         to: '/bbdd-trabajadores', icon: Users },
  { key: 'nominas',           label: 'Nóminas',      to: '/nominas',           icon: FileText },
  { key: 'condiciones',       label: 'Condiciones',  to: '/condiciones',       icon: ScrollText },
]

const SOCIOS: ModuleNav[] = [
  { key: 'sueldos', label: 'Sueldos', to: '/sueldos', icon: Wallet },
]

const PRELOADERS: Record<string, () => void> = {
  '/':                 () => { void import('@/pages/HomePage') },
  '/manager':          () => { void import('@/modules/manager/ManagerPage') },
  '/agente':           () => { void import('@/modules/agente/AgentePage') },
  '/pedidos-wa':       () => { void import('@/modules/pedidos-wa/PedidosWaPage') },
  '/cash':             () => { void import('@/modules/cash/CashPage') },
  '/clientes':         () => { void import('@/modules/clientes/ClientesPage') },
  '/cobros':           () => { void import('@/modules/cobros/CobrosPage') },
  '/gastos':           () => { void import('@/modules/gastos/GastosPage') },
  '/tesoreria':        () => { void import('@/modules/tesoreria/TesoreriaPage') },
  '/listado-precios':  () => { void import('@/modules/listado-precios/ListadoPreciosPage') },
  '/trabajadores':     () => { void import('@/modules/trabajadores/TrabajadoresOpPage') },
  '/bbdd-trabajadores':() => { void import('@/modules/trabajadores/TrabajadoresPage') },
  '/nominas':          () => { void import('@/modules/nominas/NominasPage') },
  '/condiciones':      () => { void import('@/modules/condiciones/CondicionesPage') },
  '/sueldos':          () => { void import('@/modules/sueldos/SueldosPage') },
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function SidebarAvatar({ name }: { name: string }) {
  return (
    <div
      style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(140deg, oklch(70% .14 158), oklch(40% .10 158))',
        display: 'grid', placeItems: 'center',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600, fontSize: 11, color: '#0a1310',
      }}
    >
      {getInitials(name)}
    </div>
  )
}

export function AppShell() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const role = profile?.role
  const qc = useQueryClient()
  const preload = useCallback((to: string) => { PRELOADERS[to]?.() }, [])
  const visible = MODULES.filter((m) => role && canAccess(m.key, role))
  const equipo  = EQUIPO.filter((m) => role && canAccess(m.key, role))
  const socios  = SOCIOS.filter((m) => role && canAccess(m.key, role))
  const [menuOpen, setMenuOpen] = useState({ path: location.pathname, equipo: false, socios: false })
  const equipoOpen = menuOpen.path === location.pathname && menuOpen.equipo
  const sociosOpen = menuOpen.path === location.pathname && menuOpen.socios
  const setEquipoOpen = useCallback((open: boolean) => {
    setMenuOpen((prev) => ({
      path: location.pathname,
      equipo: open,
      socios: open ? false : (prev.path === location.pathname && prev.socios),
    }))
  }, [location.pathname])
  const setSociosOpen = useCallback((open: boolean) => {
    setMenuOpen((prev) => ({
      path: location.pathname,
      equipo: open ? false : (prev.path === location.pathname && prev.equipo),
      socios: open,
    }))
  }, [location.pathname])

  useEffect(() => {
    if (!equipoOpen && !sociosOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setEquipoOpen(false); setSociosOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [equipoOpen, sociosOpen, setEquipoOpen, setSociosOpen])

  const isEquipoActive = equipo.some(m => location.pathname.startsWith(m.to))
  const isSociosActive = socios.some(m => location.pathname.startsWith(m.to))

  return (
    <div className="flex h-full overflow-x-hidden">

      {/* ── Sidebar desktop ── */}
      <aside
        className="app-shell-sidebar hidden md:flex w-[236px] flex-col"
        style={{
          background: 'linear-gradient(180deg, rgba(14,21,18,.96), rgba(10,17,14,.92))',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderRight: '1px solid var(--line)',
          padding: '18px 14px',
        }}
      >
        {/* Brand block */}
        <Link
          to="/"
          className="flex items-center gap-3 mb-5 px-1 group"
          style={{ textDecoration: 'none' }}
        >
          <div
            className="serif"
            style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(140deg, var(--mint), var(--mint-deep))',
              display: 'grid', placeItems: 'center',
              fontSize: 24, fontWeight: 500, color: '#0a1310',
              boxShadow: '0 0 24px var(--mint-glow), inset 0 0 0 1px rgba(255,255,255,.22)',
            }}
          >
            a
          </div>
          <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
              Abocados <span style={{ color: 'var(--ink-dim)' }}>OS</span>
            </div>
            <div className="micro-caps" style={{ color: 'var(--ink-mute)', marginTop: 2 }}>
              Centro de control
            </div>
          </div>
        </Link>

        {/* Command bar (decorativo — ⌘K futuro) */}
        <button
          type="button"
          className="flex items-center gap-2 w-full mb-4"
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius)',
            background: 'rgba(255,255,255,.02)',
            border: '1px solid var(--line)',
            color: 'var(--ink-mute)',
            fontSize: 12,
            cursor: 'default',
            textAlign: 'left',
          }}
        >
          <Command className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
            <span className="flex-1">Buscar o ejecutar...</span>
          <span
            className="mono"
            style={{
              fontSize: 10, color: 'var(--ink-mute)',
              border: '1px solid var(--line-2)',
              borderRadius: 4, padding: '1px 5px',
            }}
          >
            ⌘K
          </span>
        </button>

        {/* Primary nav */}
        <nav className="flex-1 overflow-y-auto" style={{ marginRight: -4, paddingRight: 4 }}>
          <NavLink
            to="/"
            end
            onMouseEnter={() => preload('/')}
            className={({ isActive }) => cn('sidebar-nav-item', isActive && 'sidebar-nav-active')}
          >
            <Home className="h-4 w-4 shrink-0" strokeWidth={1.6} />
            Dashboard
          </NavLink>

          {visible.map((m) => (
            <NavLink
              key={m.key}
              to={m.to}
              onMouseEnter={() => {
                preload(m.to)
                if (m.to === '/manager') prefetchManagerResumen(qc)
              }}
              className={({ isActive }) => cn('sidebar-nav-item', isActive && 'sidebar-nav-active')}
            >
              <m.icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
              {m.label}
            </NavLink>
          ))}

          {equipo.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="label-caps" style={{ padding: '0 12px', marginBottom: 6 }}>
                Equipo
              </div>
              {equipo.map((m) => (
                <NavLink
                  key={m.key}
                  to={m.to}
                  onMouseEnter={() => preload(m.to)}
                  className={({ isActive }) => cn('sidebar-nav-item', isActive && 'sidebar-nav-active')}
                >
                  <m.icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
                  {m.label}
                </NavLink>
              ))}
            </div>
          )}

          {socios.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="label-caps" style={{ padding: '0 12px', marginBottom: 6 }}>
                Socios
              </div>
              {socios.map((m) => (
                <NavLink
                  key={m.key}
                  to={m.to}
                  onMouseEnter={() => preload(m.to)}
                  className={({ isActive }) => cn('sidebar-nav-item', isActive && 'sidebar-nav-active')}
                >
                  <m.icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
                  {m.label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        {/* User card footer */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
          <div className="ao-panel flex items-center gap-2.5 px-2.5 py-2.5">
            <SidebarAvatar name={profile?.display_name ?? 'U'} />
            <div className="flex-1 min-w-0">
              <div
                className="truncate"
                style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}
              >
                {profile?.display_name ?? '—'}
              </div>
              <div className="micro-caps truncate" style={{ color: 'var(--mint)', marginTop: 1 }}>
                {profile?.role ?? '—'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-[var(--radius-sm)] p-1.5 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
              style={{ color: 'var(--ink-mute)' }}
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="app-shell-main flex min-w-0 flex-1 flex-col">

        {/* Header móvil */}
        <div className="bg-[var(--color-panel)] pt-[env(safe-area-inset-top)] md:hidden">
          <header className="flex h-14 items-center justify-between gap-2 border-b border-[var(--line)] px-4">
            <Link
              to="/"
              className="text-base font-bold"
              style={{ color: 'var(--ink)', textDecoration: 'none' }}
            >
              Abocados
            </Link>
            <div className="flex items-center gap-1">
              {equipo.length > 0 && (
                <button
                  type="button"
                  onClick={() => setEquipoOpen(true)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-[var(--radius)] px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    isEquipoActive
                      ? 'bg-[var(--mint-glow)] text-[var(--mint)]'
                      : 'text-[var(--ink-dim)] hover:bg-[rgba(255,255,255,.04)]',
                  )}
                  aria-label="Abrir menú equipo"
                >
                  <UsersRound className="h-4 w-4" strokeWidth={1.6} />
                  Equipo
                </button>
              )}
              {socios.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSociosOpen(true)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-[var(--radius)] px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    isSociosActive
                      ? 'bg-[var(--mint-glow)] text-[var(--mint)]'
                      : 'text-[var(--ink-dim)] hover:bg-[rgba(255,255,255,.04)]',
                  )}
                  aria-label="Abrir menú socios"
                >
                  <Wallet className="h-4 w-4" strokeWidth={1.6} />
                  Socios
                </button>
              )}
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-[var(--radius)] p-2"
                style={{ color: 'var(--ink-dim)' }}
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </div>
          </header>
        </div>

        <div className="w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <Outlet key={location.pathname} />
        </div>

        {/* Bottom nav móvil */}
        {visible.length > 0 && (
          <nav
            className="fixed bottom-0 left-0 right-0 z-30 flex overflow-x-auto border-t pb-[env(safe-area-inset-bottom)] md:hidden"
            style={{
              borderColor: 'var(--line)',
              background: 'rgba(10,17,14,.94)',
              backdropFilter: 'blur(10px)',
              scrollbarWidth: 'none',
            }}
          >
            <NavLink
              to="/"
              end
              onTouchStart={() => preload('/')}
              className={({ isActive }) =>
                cn(
                  'flex min-w-[72px] flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-[10px] uppercase tracking-wider transition-colors',
                  isActive ? 'text-[var(--color-mint)]' : 'text-[var(--ink-mute)]',
                )
              }
            >
              <Home className="h-5 w-5 shrink-0" strokeWidth={1.6} />
              <span className="w-full truncate text-center">Inicio</span>
            </NavLink>
            {visible.map((m) => (
              <NavLink
                key={m.key}
                to={m.to}
                onTouchStart={() => preload(m.to)}
                className={({ isActive }) =>
                  cn(
                    'flex min-w-[72px] flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-[10px] uppercase tracking-wider transition-colors',
                    isActive ? 'text-[var(--color-mint)]' : 'text-[var(--ink-mute)]',
                  )
                }
              >
                <m.icon className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                <span className="w-full truncate text-center">{m.label}</span>
              </NavLink>
            ))}
          </nav>
        )}

        {/* Drawer Equipo (móvil) */}
        {equipoOpen && (
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
            onClick={() => setEquipoOpen(false)}
            aria-hidden
          >
            <div
              className="absolute right-0 top-0 h-full w-72 max-w-[85%]"
              style={{ background: 'var(--panel)', borderLeft: '1px solid var(--line)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex h-14 items-center justify-between px-4"
                style={{ borderBottom: '1px solid var(--line)' }}
              >
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  <UsersRound className="h-4 w-4" style={{ color: 'var(--mint)' }} strokeWidth={1.6} />
                  Equipo
                </div>
                <button
                  type="button"
                  onClick={() => setEquipoOpen(false)}
                  className="rounded-[var(--radius-sm)] p-1.5 transition-colors hover:bg-[rgba(255,255,255,.04)]"
                  style={{ color: 'var(--ink-mute)' }}
                  aria-label="Cerrar menú equipo"
                >
                  <X className="h-4 w-4" strokeWidth={1.6} />
                </button>
              </div>
              <nav className="space-y-0.5 p-3">
                {equipo.map((m) => (
                  <NavLink
                    key={m.key}
                    to={m.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between gap-3 rounded-[var(--radius)] px-3 py-3 text-sm transition-colors',
                        isActive
                          ? 'bg-[var(--mint-glow)] text-[var(--mint)] font-medium'
                          : 'text-[var(--ink-dim)] hover:bg-[rgba(255,255,255,.03)] hover:text-[var(--ink)]',
                      )
                    }
                  >
                    <span className="flex items-center gap-3">
                      <m.icon className="h-4 w-4" strokeWidth={1.6} />
                      {m.label}
                    </span>
                    <ChevronRight className="h-4 w-4" style={{ color: 'var(--ink-mute)' }} strokeWidth={1.6} />
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Drawer Socios (móvil) */}
        {sociosOpen && (
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
            onClick={() => setSociosOpen(false)}
            aria-hidden
          >
            <div
              className="absolute right-0 top-0 h-full w-72 max-w-[85%]"
              style={{ background: 'var(--panel)', borderLeft: '1px solid var(--line)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex h-14 items-center justify-between px-4"
                style={{ borderBottom: '1px solid var(--line)' }}
              >
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  <Wallet className="h-4 w-4" style={{ color: 'var(--mint)' }} strokeWidth={1.6} />
                  Socios
                </div>
                <button
                  type="button"
                  onClick={() => setSociosOpen(false)}
                  className="rounded-[var(--radius-sm)] p-1.5 transition-colors hover:bg-[rgba(255,255,255,.04)]"
                  style={{ color: 'var(--ink-mute)' }}
                  aria-label="Cerrar menú socios"
                >
                  <X className="h-4 w-4" strokeWidth={1.6} />
                </button>
              </div>
              <nav className="space-y-0.5 p-3">
                {socios.map((m) => (
                  <NavLink
                    key={m.key}
                    to={m.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between gap-3 rounded-[var(--radius)] px-3 py-3 text-sm transition-colors',
                        isActive
                          ? 'bg-[var(--mint-glow)] text-[var(--mint)] font-medium'
                          : 'text-[var(--ink-dim)] hover:bg-[rgba(255,255,255,.03)] hover:text-[var(--ink)]',
                      )
                    }
                  >
                    <span className="flex items-center gap-3">
                      <m.icon className="h-4 w-4" strokeWidth={1.6} />
                      {m.label}
                    </span>
                    <ChevronRight className="h-4 w-4" style={{ color: 'var(--ink-mute)' }} strokeWidth={1.6} />
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
