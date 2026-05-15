import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Award, CalendarOff, Plus, ShoppingBasket, CalendarDays } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { euros } from '@/shared/lib/format'
import { FicharButton } from './FicharButton'

interface EmpleadoHeroProps {
  empleadoId: string
  nombre: string
  pack: 1 | 2 | 3
  puesto?: string | null
  puntosMes: number
  puntosEuros: number
  creditoDisponible?: number | null
  creditoGastado?: number | null
  creditoLimite?: number | null
  vacRestantes?: number | null
  vacTotales?: number | null
  sabadosNum?: number | null
  sabadosImporte?: number | null
  onSolicitar?: () => void
}

const PTS_MAX = 140
const PTS_TIERS = [
  { min: 140, label: '150€', color: 'var(--mint)' },
  { min: 120, label: '100€', color: 'var(--mint)' },
  { min: 100, label: '50€',  color: 'var(--amber)' },
  { min: 0,   label: '0€',   color: 'var(--ink-mute)' },
]

function ptsToTier(pts: number) {
  return PTS_TIERS.find(t => pts >= t.min) ?? PTS_TIERS[PTS_TIERS.length - 1]!
}

export function EmpleadoHero({
  empleadoId, nombre, pack, puesto,
  puntosMes, puntosEuros,
  creditoDisponible, creditoGastado, creditoLimite,
  vacRestantes, vacTotales,
  sabadosNum, sabadosImporte,
  onSolicitar,
}: EmpleadoHeroProps) {
  const initials = nombre
    .split(' ')
    .slice(0, 2)
    .map(w => (w[0] ?? '').toUpperCase())
    .join('')

  const mesLabel = format(startOfMonth(new Date()), "LLLL yyyy", { locale: es })

  const ptsProgress = Math.min(100, (puntosMes / PTS_MAX) * 100)
  const tier = ptsToTier(puntosMes)

  const vacUsed = vacTotales != null && vacRestantes != null ? vacTotales - vacRestantes : null
  const vacProgress = vacTotales && vacUsed != null ? Math.min(100, (vacUsed / vacTotales) * 100) : null

  const creditProgress =
    creditoLimite && creditoLimite > 0 && creditoGastado != null
      ? Math.min(100, (creditoGastado / creditoLimite) * 100)
      : null

  const showPuntos = pack === 1
  const showCredito = (pack === 1 || pack === 3) && creditoDisponible != null
  const showVac = false
  const showSabados = false

  return (
    <div className="mb-5 ao-fade-in-up">
      <div className="emp-hero-card">
        <div className="relative z-10">

          {/* Header: avatar + name */}
          <div className="flex items-start gap-4 mb-5">
            <div
              className="emp-avatar"
              style={{ width: 54, height: 54, fontSize: 18, letterSpacing: '-0.02em' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h1 className="font-display text-[22px] font-bold leading-tight text-[var(--ink)]">
                  {nombre}
                </h1>
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    background: 'var(--mint-glow)',
                    color: 'var(--mint)',
                    border: '1px solid oklch(78% .14 158 / .22)',
                  }}
                >
                  {pack === 3 ? 'Prácticas' : `Pack ${pack}`}
                </span>
              </div>
              {puesto && (
                <p className="text-sm text-[var(--ink-dim)] leading-tight">{puesto}</p>
              )}
              <p className="text-[11px] text-[var(--ink-mute)] mt-0.5 capitalize tracking-wide">
                {mesLabel}
              </p>
            </div>
          </div>

          {/* KPI tiles */}
          <div className={`grid gap-2 mb-4 ao-stagger ${showPuntos && showCredito && showVac ? 'grid-cols-3' : showPuntos || showCredito ? 'grid-cols-2' : 'grid-cols-1'}`}>

            {showPuntos && (
              <div className="emp-kpi-tile">
                <div className="flex items-center gap-1.5 mb-1">
                  <Award className="h-3.5 w-3.5" style={{ color: 'var(--mint)' }} />
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Puntos</span>
                </div>
                <div
                  className="font-display text-[28px] font-bold tabular-nums leading-none"
                  style={{ color: tier.color }}
                >
                  {puntosMes}
                </div>
                <div className="text-[11px] text-[var(--ink-mute)] mt-1">
                  {puntosEuros > 0 ? `→ ${euros(puntosEuros)}` : `→ ${tier.label} si cierras`}
                </div>
              </div>
            )}

            {showVac && (
              <div className="emp-kpi-tile">
                <div className="flex items-center gap-1.5 mb-1">
                  <CalendarOff className="h-3.5 w-3.5" style={{ color: 'var(--sky)' }} />
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Vacaciones</span>
                </div>
                <div
                  className="font-display text-[28px] font-bold tabular-nums leading-none"
                  style={{ color: 'var(--sky)' }}
                >
                  {vacRestantes}
                </div>
                <div className="text-[11px] text-[var(--ink-mute)] mt-1">
                  días de {vacTotales}
                </div>
              </div>
            )}

            {showCredito && (
              <div className="emp-kpi-tile">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShoppingBasket className="h-3.5 w-3.5" style={{ color: 'var(--amber)' }} />
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Crédito frutas</span>
                </div>
                <div
                  className="font-display text-[28px] font-bold tabular-nums leading-none"
                  style={{ color: (creditoDisponible ?? 0) < 0 ? 'var(--coral)' : 'var(--amber)' }}
                >
                  {euros(creditoDisponible ?? 0)}
                </div>
                <div className="text-[11px] text-[var(--ink-mute)] mt-1">
                  gastado {euros(creditoGastado ?? 0)}
                </div>
              </div>
            )}

            {showSabados && (
              <div className="emp-kpi-tile">
                <div className="flex items-center gap-1.5 mb-1">
                  <CalendarDays className="h-3.5 w-3.5" style={{ color: 'var(--amber)' }} />
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Sábados</span>
                </div>
                <div
                  className="font-display text-[28px] font-bold tabular-nums leading-none"
                  style={{ color: 'var(--amber)' }}
                >
                  {sabadosNum}
                </div>
                <div className="text-[11px] text-[var(--ink-mute)] mt-1">
                  → {euros(sabadosImporte ?? 0)}
                </div>
              </div>
            )}
          </div>

          {/* Progress bars */}
          <div className="space-y-3">

            {/* Points progress (pack 1) */}
            {showPuntos && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
                    Objetivo puntos
                  </span>
                  <span className="text-[11px] tabular-nums text-[var(--ink-dim)]">
                    {puntosMes}/{PTS_MAX} pts · canje {tier.label}
                  </span>
                </div>
                <div className="ao-progress-bar">
                  <div
                    className="ao-progress-bar-fill"
                    style={{ '--progress': `${ptsProgress}%` } as React.CSSProperties}
                  />
                </div>
                {/* Tier markers */}
                <div className="relative h-4 mt-0.5">
                  {([100, 120, 140] as const).map((v, i) => (
                    <div
                      key={v}
                      className="absolute top-0 -translate-x-1/2 text-[9px] font-mono tabular-nums"
                      style={{
                        left: `${(v / PTS_MAX) * 100}%`,
                        color: puntosMes >= v ? 'var(--mint)' : 'var(--ink-mute)',
                      }}
                    >
                      {i === 0 ? '50€' : i === 1 ? '100€' : '150€'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vacation progress */}
            {showVac && vacProgress != null && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
                    Vacaciones usadas
                  </span>
                  <span className="text-[11px] tabular-nums text-[var(--ink-dim)]">
                    {vacUsed} / {vacTotales} días
                  </span>
                </div>
                <div className="ao-progress-bar">
                  <div
                    className="ao-progress-bar-fill ao-progress-bar-fill-sky"
                    style={{ '--progress': `${vacProgress}%` } as React.CSSProperties}
                  />
                </div>
              </div>
            )}

            {/* Credit progress */}
            {showCredito && creditProgress != null && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
                    Crédito frutas usado
                  </span>
                  <span className="text-[11px] tabular-nums text-[var(--ink-dim)]">
                    {euros(creditoGastado ?? 0)} / {euros(creditoLimite ?? 0)}
                  </span>
                </div>
                <div className="ao-progress-bar">
                  <div
                    className="ao-progress-bar-fill ao-progress-bar-fill-amber"
                    style={{ '--progress': `${creditProgress}%` } as React.CSSProperties}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Fichar */}
          <div className="mt-4">
            <FicharButton empleadoId={empleadoId} />
          </div>

          {/* CTA vacaciones */}
          {showVac && onSolicitar && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                style={{ borderColor: 'oklch(76% .12 235 / .28)', color: 'var(--sky)' }}
                onClick={onSolicitar}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Solicitar vacaciones
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
