import { Link } from 'react-router-dom'
import {
  BarChart3,
  Banknote,
  CheckSquare,
  CalendarDays,
  Wallet,
  ArrowRight,
} from 'lucide-react'
import { useAuth } from '@/shared/auth/AuthContext'
import { canAccess, type ModuleKey } from '@/shared/types'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'

type ModuleEntry = {
  key: ModuleKey
  title: string
  desc: string
  to: string
  Icon: React.ComponentType<{ className?: string }>
}

const ENTRIES: ModuleEntry[] = [
  {
    key: 'manager',
    title: 'Manager',
    desc: 'Análisis de ventas, márgenes y pedidos',
    to: '/manager',
    Icon: BarChart3,
  },
  {
    key: 'cash',
    title: 'Caja',
    desc: 'Control diario de efectivo',
    to: '/cash',
    Icon: Banknote,
  },
  {
    key: 'tareas',
    title: 'Tareas',
    desc: 'Gestión de tareas internas',
    to: '/tareas',
    Icon: CheckSquare,
  },
  {
    key: 'turnos',
    title: 'Turnos',
    desc: 'Planning del equipo',
    to: '/turnos',
    Icon: CalendarDays,
  },
  {
    key: 'tesoreria',
    title: 'Tesorería',
    desc: 'Pagos y cuentas bancarias',
    to: '/tesoreria',
    Icon: Wallet,
  },
]

export function HomePage() {
  const { profile } = useAuth()
  const role = profile?.role
  const visible = ENTRIES.filter((e) => role && canAccess(e.key, role))

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:py-12">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Hola, {profile?.display_name ?? '—'}
        </p>
        <h1 className="font-display text-3xl font-bold text-[var(--color-ink)] md:text-4xl">
          Operativa Frutas Abocados
        </h1>
        <p className="mt-2 max-w-prose text-sm text-[var(--color-ink-2)]">
          Todo lo que usabais antes en 5 apps separadas, ahora en un sitio. Selecciona
          un módulo para empezar.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(({ key, title, desc, to, Icon }) => (
          <Link key={key} to={to} className="group block">
            <Card className="h-full transition-all hover:border-[var(--color-primary)] hover:shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--color-ink-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]" />
                </div>
                <CardTitle className="mt-3">{title}</CardTitle>
                <CardDescription>{desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-xs text-[var(--color-ink-3)]">Próximamente</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
