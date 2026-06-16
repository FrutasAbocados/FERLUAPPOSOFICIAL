import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Award, ChevronDown, ChevronLeft, ChevronRight, Star, StickyNote } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import type { EmpleadoPropio } from '../lib/useEmpleadoPropio'

interface ResumenMes {
  empleado_id: string
  nombre: string
  dias_puntuados: number
  pts_base: number
  pts_ajustes: number
  pts_canjeados: number
  total_puntos: number
  pts_puntualidad: number
  pts_reparto: number
  pts_responsabilidad: number
  euros: number
}

interface DetalleDia {
  fecha: string
  puntualidad: number
  reparto: number
  responsabilidad: number
  total: number
  nota_puntualidad: string | null
  nota_reparto: string | null
  nota_responsabilidad: string | null
}

const TIERS = [
  { min: 140, canje: 150, label: 'Máximo · 150€', color: 'var(--mint)' },
  { min: 120, canje: 100, label: '120+ pts · 100€', color: 'var(--mint)' },
  { min: 100, canje: 50,  label: '100+ pts · 50€',  color: 'var(--amber)' },
  { min: 0,   canje: 0,   label: 'Menos de 100 pts · 0€', color: 'var(--ink-mute)' },
]

function getTier(pts: number) {
  return TIERS.find(t => pts >= t.min) ?? TIERS[TIERS.length - 1]!
}

function num(v: unknown) { return Number(v ?? 0) }

function useResumenMes(empleadoId: string, mesISO: string) {
  return useQuery({
    queryKey: ['emp-pts-resumen', empleadoId, mesISO] as const,
    queryFn: async (): Promise<ResumenMes | null> => {
      const { data, error } = await supabase.rpc('trabajadores_puntos_resumen_mes', { p_mes: mesISO })
      if (error) throw error
      const rows = (data ?? []) as ResumenMes[]
      const mine = rows.find(r => r.empleado_id === empleadoId)
      if (!mine) return null
      return {
        ...mine,
        dias_puntuados: num(mine.dias_puntuados),
        pts_base: num(mine.pts_base),
        pts_ajustes: num(mine.pts_ajustes),
        pts_canjeados: num(mine.pts_canjeados ?? 0),
        total_puntos: num(mine.total_puntos),
        pts_puntualidad: num(mine.pts_puntualidad),
        pts_reparto: num(mine.pts_reparto),
        pts_responsabilidad: num(mine.pts_responsabilidad),
        euros: num(mine.euros),
      }
    },
  })
}

function useDetalleMes(empleadoId: string, mesISO: string) {
  return useQuery({
    queryKey: ['emp-pts-detalle', empleadoId, mesISO] as const,
    queryFn: async (): Promise<DetalleDia[]> => {
      const { data, error } = await supabase.rpc('trabajadores_puntos_detalle_mes', {
        p_empleado_id: empleadoId,
        p_mes: mesISO,
      })
      if (error) throw error
      return (data ?? []) as DetalleDia[]
    },
  })
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="ao-progress-bar">
      <div
        className="ao-progress-bar-fill"
        style={{ '--progress': `${pct}%`, background: color } as React.CSSProperties}
      />
    </div>
  )
}

export function EmpleadoPuntosView({ empleado }: { empleado: EmpleadoPropio }) {
  const [mes, setMes] = useState<Date>(startOfMonth(new Date()))
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null)
  const mesISO = format(mes, 'yyyy-MM-dd')
  const mesLabel = format(mes, 'LLLL yyyy', { locale: es })
  const isCurrentMonth = mesISO === format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data: resumen, isLoading } = useResumenMes(empleado.id, mesISO)
  const { data: dias } = useDetalleMes(empleado.id, mesISO)

  const tier = getTier(resumen?.total_puntos ?? 0)
  const ptsMax = 140
  const ptsPct = Math.min(100, ((resumen?.total_puntos ?? 0) / ptsMax) * 100)

  return (
    <div className="ao-page py-5 md:py-7">
      {/* Header */}
      <header className="mb-5 ao-fade-in-up">
        <div className="flex items-center gap-2 mb-1">
          <Award className="h-5 w-5" style={{ color: 'var(--mint)' }} />
          <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Mis puntos</h1>
        </div>
        <p className="text-xs text-[var(--ink-mute)]">
          0–2 pts diarios · Puntualidad · Reparto · Responsabilidad · Canje: 100→50€ / 120→100€ / 140→150€
        </p>
      </header>

      {/* Selector de mes */}
      <div className="ao-panel flex items-center justify-between gap-3 px-4 py-3 mb-4 ao-fade-in-up" style={{ animationDelay: '.06s' }}>
        <Button size="sm" variant="outline" onClick={() => setMes(m => subMonths(m, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-display text-base font-bold capitalize text-[var(--ink)]">{mesLabel}</span>
        <Button size="sm" variant="outline" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} disabled={isCurrentMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading && (
        <div className="ao-card p-6 text-center text-sm text-[var(--ink-mute)]">Cargando…</div>
      )}

      {!isLoading && resumen && (
        <>
          {/* KPI hero */}
          <div className="emp-hero-card mb-4 ao-fade-in-up" style={{ animationDelay: '.1s' }}>
            <div className="relative z-10">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-1">Total del mes</div>
                  <div className="font-display text-5xl font-bold tabular-nums leading-none" style={{ color: tier.color }}>
                    {resumen.total_puntos}
                    <span className="text-lg ml-1 font-normal" style={{ color: 'var(--ink-mute)' }}>/ {ptsMax}</span>
                  </div>
                  <div className="mt-1 text-sm" style={{ color: tier.color }}>{tier.label}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-1">Canje estimado</div>
                  <div className="font-display text-3xl font-bold tabular-nums" style={{ color: 'var(--mint)' }}>
                    {euros(resumen.euros > 0 ? resumen.euros : tier.canje)}
                  </div>
                  <div className="text-xs text-[var(--ink-mute)]">{resumen.dias_puntuados} días puntuados</div>
                </div>
              </div>

              {/* Progress */}
              <div className="mb-4">
                <div className="ao-progress-bar mb-1">
                  <div
                    className="ao-progress-bar-fill"
                    style={{ '--progress': `${ptsPct}%` } as React.CSSProperties}
                  />
                </div>
                <div className="relative h-4">
                  {[100, 120, 140].map((v, i) => (
                    <div
                      key={v}
                      className="absolute top-0 -translate-x-1/2 text-[9px] font-mono"
                      style={{
                        left: `${(v / ptsMax) * 100}%`,
                        color: (resumen.total_puntos ?? 0) >= v ? 'var(--mint)' : 'var(--ink-mute)',
                      }}
                    >
                      {['50€', '100€', '150€'][i]}
                    </div>
                  ))}
                </div>
              </div>

              {/* Categorías */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Puntualidad', value: resumen.pts_puntualidad, color: 'var(--mint)', max: resumen.dias_puntuados * 2 },
                  { label: 'Reparto',     value: resumen.pts_reparto,     color: 'var(--sky)',  max: resumen.dias_puntuados * 2 },
                  { label: 'Responsab.', value: resumen.pts_responsabilidad, color: 'var(--amber)', max: resumen.dias_puntuados * 2 },
                ].map(cat => (
                  <div key={cat.label} className="emp-kpi-tile">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-1">{cat.label}</div>
                    <div className="font-display text-xl font-bold tabular-nums" style={{ color: cat.color }}>{cat.value}</div>
                    <div className="mt-1.5">
                      <MiniBar value={cat.value} max={cat.max || 1} color={cat.color} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Ajustes si los hay */}
              {(resumen.pts_ajustes !== 0 || resumen.pts_canjeados !== 0) && (
                <div className="mt-3 text-xs text-[var(--ink-mute)] border-t border-[var(--line)] pt-3">
                  {resumen.pts_base} base
                  {resumen.pts_ajustes !== 0 && <> · {resumen.pts_ajustes >= 0 ? '+' : ''}{resumen.pts_ajustes} ajuste</>}
                  {resumen.pts_canjeados !== 0 && <> · −{resumen.pts_canjeados} ruleta</>}
                  {' '}= <strong style={{ color: 'var(--ink)' }}>{resumen.total_puntos} pts</strong>
                </div>
              )}
            </div>
          </div>

          {/* Historial de días */}
          {dias && dias.length > 0 && (
            <div className="ao-card p-0 overflow-hidden ao-fade-in-up" style={{ animationDelay: '.16s' }}>
              <div className="px-4 py-3 border-b border-[var(--line)]">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Días puntuados este mes</h2>
                <p className="mt-0.5 text-[10px] text-[var(--ink-mute)]">Toca un día para ver las notas de Álvaro</p>
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {[...dias].reverse().map(d => {
                  const algunaNota = !!(d.nota_puntualidad || d.nota_reparto || d.nota_responsabilidad)
                  const abierto = diaAbierto === d.fecha
                  return (
                    <li key={d.fecha}>
                      <button
                        type="button"
                        onClick={() => setDiaAbierto(abierto ? null : d.fecha)}
                        aria-expanded={abierto}
                        className="w-full px-4 py-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,.03)]"
                      >
                        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-2 text-sm">
                          <span className="capitalize text-[var(--ink-dim)] flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{format(parseISO(d.fecha), "EEE d MMM", { locale: es })}</span>
                            {algunaNota && <StickyNote className="h-3 w-3 shrink-0" style={{ color: 'var(--amber)' }} aria-label="Tiene notas" />}
                          </span>
                          <DiaBadge label="P" value={d.puntualidad} />
                          <DiaBadge label="R" value={d.reparto} />
                          <DiaBadge label="Rs" value={d.responsabilidad} />
                          <span
                            className="font-display text-base font-bold tabular-nums w-6 text-right"
                            style={{ color: d.total >= 5 ? 'var(--mint)' : d.total >= 3 ? 'var(--ink)' : 'var(--ink-mute)' }}
                          >
                            {d.total}
                          </span>
                          <ChevronDown
                            className="h-4 w-4 shrink-0 text-[var(--ink-mute)] transition-transform"
                            style={{ transform: abierto ? 'rotate(180deg)' : undefined }}
                          />
                        </div>
                      </button>
                      {abierto && (
                        <div className="px-4 pb-3">
                          {algunaNota ? (
                            <div className="space-y-1.5 rounded-lg border border-[var(--line)] bg-[rgba(255,255,255,.02)] p-2.5 text-[11px] leading-snug text-[var(--ink-dim)]">
                              {d.nota_puntualidad && (
                                <div className="flex gap-1.5">
                                  <Star className="h-3 w-3 shrink-0 mt-0.5" style={{ color: 'var(--mint)' }} />
                                  <span><strong className="text-[var(--ink)]">Puntualidad:</strong> {d.nota_puntualidad}</span>
                                </div>
                              )}
                              {d.nota_reparto && (
                                <div className="flex gap-1.5">
                                  <Star className="h-3 w-3 shrink-0 mt-0.5" style={{ color: 'var(--sky)' }} />
                                  <span><strong className="text-[var(--ink)]">Reparto:</strong> {d.nota_reparto}</span>
                                </div>
                              )}
                              {d.nota_responsabilidad && (
                                <div className="flex gap-1.5">
                                  <Star className="h-3 w-3 shrink-0 mt-0.5" style={{ color: 'var(--amber)' }} />
                                  <span><strong className="text-[var(--ink)]">Responsabilidad:</strong> {d.nota_responsabilidad}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] italic text-[var(--ink-mute)]">Sin notas de Álvaro para este día.</p>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Mini historial 3 meses anteriores */}
          <UltimosNMeses empleadoId={empleado.id} mesActual={mes} />
        </>
      )}

      {!isLoading && !resumen && (
        <div className="ao-card p-6 text-center">
          <Award className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--ink-mute)' }} />
          <p className="text-sm text-[var(--ink-mute)]">Sin puntos registrados este mes.</p>
        </div>
      )}
    </div>
  )
}

function DiaBadge({ label, value }: { label: string; value: number }) {
  const bg =
    value === 0 ? 'rgba(255,255,255,.04)' :
    value === 1 ? 'oklch(30% .10 70 / .35)' :
    'oklch(30% .12 158 / .40)'
  const color =
    value === 0 ? 'var(--ink-mute)' :
    value === 1 ? 'var(--amber)' :
    'var(--mint)'
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold tabular-nums"
      style={{ background: bg, color }}
    >
      {label} {value}
    </span>
  )
}

function UltimosNMeses({ empleadoId, mesActual }: { empleadoId: string; mesActual: Date }) {
  const meses = [1, 2, 3].map(n => ({
    date: subMonths(mesActual, n),
    iso: format(subMonths(mesActual, n), 'yyyy-MM-dd'),
    label: format(subMonths(mesActual, n), 'LLL', { locale: es }),
  }))

  return (
    <div className="mt-4 ao-fade-in-up" style={{ animationDelay: '.22s' }}>
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-2 px-1">Meses anteriores</h2>
      <div className="grid grid-cols-3 gap-2">
        {meses.map(m => (
          <MesResumenMini key={m.iso} empleadoId={empleadoId} mesISO={m.iso} label={m.label} />
        ))}
      </div>
    </div>
  )
}

function MesResumenMini({ empleadoId, mesISO, label }: { empleadoId: string; mesISO: string; label: string }) {
  const { data } = useQuery({
    queryKey: ['emp-pts-resumen', empleadoId, mesISO] as const,
    queryFn: async (): Promise<ResumenMes | null> => {
      const { data, error } = await supabase.rpc('trabajadores_puntos_resumen_mes', { p_mes: mesISO })
      if (error) throw error
      const rows = (data ?? []) as ResumenMes[]
      const mine = rows.find(r => r.empleado_id === empleadoId)
      if (!mine) return null
      return {
        ...mine,
        total_puntos: num(mine.total_puntos),
        euros: num(mine.euros),
        dias_puntuados: num(mine.dias_puntuados),
        pts_base: num(mine.pts_base),
        pts_ajustes: num(mine.pts_ajustes),
        pts_canjeados: num(mine.pts_canjeados ?? 0),
        pts_puntualidad: num(mine.pts_puntualidad),
        pts_reparto: num(mine.pts_reparto),
        pts_responsabilidad: num(mine.pts_responsabilidad),
      }
    },
  })

  const pts = data?.total_puntos ?? 0
  const tier = getTier(pts)
  const pct = Math.min(100, (pts / 140) * 100)

  return (
    <div className="emp-kpi-tile">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-1 capitalize">{label}</div>
      <div className="font-display text-xl font-bold tabular-nums" style={{ color: tier.color }}>{pts}</div>
      <div className="text-[10px] text-[var(--ink-mute)]">→ {euros(data?.euros ?? tier.canje)}</div>
      <div className="ao-progress-bar mt-1.5">
        <div className="ao-progress-bar-fill" style={{ '--progress': `${pct}%` } as React.CSSProperties} />
      </div>
    </div>
  )
}
