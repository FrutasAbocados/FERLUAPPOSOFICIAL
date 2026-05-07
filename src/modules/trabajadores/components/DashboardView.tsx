import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Award, CalendarDays, CalendarOff, Plus, ShoppingBasket, Users } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { useAuth } from '@/shared/auth/useAuth'
import { SolicitarVacacionesModal } from './SolicitarVacacionesModal'
import { ColaboradoresView } from './ColaboradoresView'
import { PlusSelfCard } from './PlusSelfCard'
import { RuletaSelfCard } from './RuletaSelfCard'

interface Empleado {
  id: string
  nombre: string
  pack: 1 | 2 | 3
  user_id: string | null
  activo: boolean
}

interface PuntosFila {
  empleado_id: string
  total_puntos: number
  euros: number
}
interface CreditoFila {
  empleado_id: string
  limite_base: number
  gastado: number
  disponible: number
  exceso_arrastrado: number
}
interface VacacionesFila {
  empleado_id: string
  dias_anuales: number
  disfrutados: number
  aprobados: number
  pendientes: number
  restantes: number
}
interface SabadosFila {
  empleado_id: string
  num_sabados: number
  importe: number
}

const eur = euros

function num(v: unknown): number { return Number(v ?? 0) }

export function DashboardView() {
  const { profile } = useAuth()
  const role = profile?.role
  const isAdmin = role === 'admin_full' || role === 'admin_op' || role === 'responsable'
  const [solicitar, setSolicitar] = useState<{ id: string; nombre: string; dias: number } | null>(null)

  const mesISO = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const anio = new Date().getFullYear()

  const { data: empleados } = useQuery({
    queryKey: ['dash-trab-empleados'] as const,
    queryFn: async (): Promise<Empleado[]> => {
      const { data, error } = await supabase
        .from('empleados_equipo')
        .select('id, nombre, pack, user_id, activo')
        .eq('activo', true)
        .order('nombre')
      if (error) throw error
      return (data ?? []) as Empleado[]
    },
  })

  const { data: puntos } = useQuery({
    queryKey: ['dash-trab-puntos', mesISO] as const,
    queryFn: async (): Promise<PuntosFila[]> => {
      const { data, error } = await supabase.rpc('trabajadores_puntos_resumen_mes', { p_mes: mesISO })
      if (error) throw error
      return (data ?? []).map((r: PuntosFila) => ({ ...r, total_puntos: num(r.total_puntos), euros: num(r.euros) }))
    },
  })

  const { data: credito } = useQuery({
    queryKey: ['dash-trab-credito'] as const,
    queryFn: async (): Promise<CreditoFila[]> => {
      const { data, error } = await supabase.rpc('trabajadores_credito_estado_actual')
      if (error) throw error
      return (data ?? []).map((r: CreditoFila) => ({
        empleado_id: r.empleado_id,
        limite_base: num(r.limite_base),
        gastado: num(r.gastado),
        disponible: num(r.disponible),
        exceso_arrastrado: num(r.exceso_arrastrado),
      }))
    },
  })

  const { data: vacaciones } = useQuery({
    queryKey: ['dash-trab-vac', anio] as const,
    queryFn: async (): Promise<VacacionesFila[]> => {
      const { data, error } = await supabase.rpc('trabajadores_vacaciones_resumen_anual', { p_anio: anio })
      if (error) throw error
      return (data ?? []).map((r: VacacionesFila) => ({
        empleado_id: r.empleado_id,
        dias_anuales: num(r.dias_anuales),
        disfrutados: num(r.disfrutados),
        aprobados: num(r.aprobados),
        pendientes: num(r.pendientes),
        restantes: num(r.restantes),
      }))
    },
  })

  const { data: sabados } = useQuery({
    queryKey: ['dash-trab-sab', mesISO] as const,
    queryFn: async (): Promise<SabadosFila[]> => {
      const { data, error } = await supabase.rpc('trabajadores_sabados_resumen_mes', { p_mes: mesISO })
      if (error) throw error
      return (data ?? []).map((r: SabadosFila) => ({
        empleado_id: r.empleado_id,
        num_sabados: num(r.num_sabados),
        importe: num(r.importe),
      }))
    },
  })

  // Si no es admin, solo el suyo
  const visibles = useMemo(() => {
    if (!empleados) return []
    if (isAdmin) return empleados
    return empleados.filter(e => e.user_id === profile?.id)
  }, [empleados, isAdmin, profile?.id])

  const indexBy = <T extends { empleado_id: string }>(arr: T[] | undefined): Map<string, T> => {
    const m = new Map<string, T>()
    for (const r of arr ?? []) m.set(r.empleado_id, r)
    return m
  }

  const ptsByEmp = useMemo(() => indexBy(puntos), [puntos])
  const credByEmp = useMemo(() => indexBy(credito), [credito])
  const vacByEmp = useMemo(() => indexBy(vacaciones), [vacaciones])
  const sabByEmp = useMemo(() => indexBy(sabados), [sabados])

  // Ranking puntos (entre todos pack 1)
  const ranking = useMemo(() => {
    return (puntos ?? [])
      .slice()
      .sort((a, b) => num(b.total_puntos) - num(a.total_puntos))
      .map((p, i) => ({ id: p.empleado_id, posicion: i + 1, total_puntos: num(p.total_puntos), euros: num(p.euros) }))
  }, [puntos])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 border-b border-[var(--color-border)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Trabajadores</p>
        <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Dashboard</h1>
        <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
          {isAdmin
            ? `Resumen del equipo · ${format(new Date(), 'LLLL yyyy', { locale: es })}.`
            : 'Tu resumen personal.'}
        </p>
      </header>

      {/* Ranking puntos (solo si hay datos del mes) */}
      {isAdmin && ranking.length > 0 && ranking.some(r => r.total_puntos > 0) && (
        <section className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">Ranking de puntos del mes</h2>
          </div>
          <ol className="space-y-1">
            {ranking.filter(r => r.total_puntos > 0).map(r => {
              const e = empleados?.find(x => x.id === r.id)
              if (!e) return null
              return (
                <li key={r.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-2,#f8fafc)]">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    r.posicion === 1 ? 'bg-amber-200 text-amber-900' :
                    r.posicion === 2 ? 'bg-slate-200 text-slate-700' :
                    r.posicion === 3 ? 'bg-orange-200 text-orange-900' :
                    'bg-slate-100 text-slate-600'
                  }`}>{r.posicion}</span>
                  <span className="text-[var(--color-ink)]">{e.nombre}</span>
                  <span className="tabular-nums text-[var(--color-ink-3)]">{r.total_puntos} pts</span>
                  <span className="tabular-nums font-semibold text-emerald-700">{eur(r.euros)}</span>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {/* Colaboradores 5% — sustituye las tarjetas para admin */}
      {isAdmin && <ColaboradoresView />}

      {/* Cards destacadas para empleado: ruleta + plus 5% */}
      {!isAdmin && (
        <>
          <RuletaSelfCard />
          <PlusSelfCard />
        </>
      )}

      {/* Cards resumen por empleado — solo para empleado (su tarjeta personal) */}
      {!isAdmin && (
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibles.map(e => {
          const pts = ptsByEmp.get(e.id)
          const cr = credByEmp.get(e.id)
          const vc = vacByEmp.get(e.id)
          const sb = sabByEmp.get(e.id)
          return (
            <li key={e.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary-soft)]">
                  <Users className="h-4 w-4 text-[var(--color-primary-2)]" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[var(--color-ink)]">{e.nombre}</div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                    {e.pack === 3 ? 'Prácticas' : `Pack ${e.pack}`}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {/* Puntos (solo pack 1) */}
                {e.pack === 1 && (
                  <Linea
                    Icon={Award}
                    label="Puntos del mes"
                    main={`${pts?.total_puntos ?? 0} pts`}
                    sub={pts ? `→ ${eur(pts.euros)}` : ''}
                  />
                )}

                {/* Crédito (pack 1 + 3) */}
                {(e.pack === 1 || e.pack === 3) && cr && (
                  <Linea
                    Icon={ShoppingBasket}
                    label="Crédito frutas"
                    main={eur(cr.disponible)}
                    sub={`gastado ${eur(cr.gastado)} de ${eur(cr.limite_base)}${cr.exceso_arrastrado > 0 ? ` · arrastre −${eur(cr.exceso_arrastrado)}` : ''}`}
                    tone={cr.disponible < 0 ? 'red' : 'green'}
                  />
                )}

                {/* Vacaciones */}
                {vc && vc.dias_anuales > 0 && (
                  <>
                    <Linea
                      Icon={CalendarOff}
                      label="Vacaciones"
                      main={`${vc.restantes} / ${vc.dias_anuales} d`}
                      sub={`disfrutado ${vc.disfrutados} · aprobado ${vc.aprobados} · pendiente ${vc.pendientes}`}
                    />
                    {/* Si es el propio user (no admin) o eres admin, puedes solicitar */}
                    {(!isAdmin || profile?.id === e.user_id) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => setSolicitar({ id: e.id, nombre: e.nombre, dias: vc.dias_anuales })}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Solicitar vacaciones
                      </Button>
                    )}
                  </>
                )}

                {/* Sábados (pack 2) */}
                {e.pack === 2 && sb && (
                  <Linea
                    Icon={CalendarDays}
                    label="Sábados (mes)"
                    main={`${sb.num_sabados} sáb.`}
                    sub={`→ ${eur(sb.importe)}`}
                    tone="amber"
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>
      )}

      {!isAdmin && visibles.length === 0 && (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-sm text-[var(--color-ink-3)]">
          {isAdmin ? 'No hay trabajadores activos.' : 'Tu cuenta no está vinculada a un trabajador. Avisa a Luis o Álvaro.'}
        </p>
      )}

      {solicitar && (
        <SolicitarVacacionesModal
          empleadoId={solicitar.id}
          empleadoNombre={solicitar.nombre}
          diasAnuales={solicitar.dias}
          onClose={() => setSolicitar(null)}
        />
      )}
    </div>
  )
}

function Linea({
  Icon, label, main, sub, tone = 'neutral',
}: {
  Icon: typeof Award
  label: string
  main: string
  sub?: string
  tone?: 'neutral' | 'green' | 'red' | 'amber'
}) {
  const color =
    tone === 'green' ? 'text-emerald-700' :
    tone === 'red' ? 'text-red-600' :
    tone === 'amber' ? 'text-amber-700' :
    'text-[var(--color-ink)]'
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1.5">
      <Icon className="h-4 w-4 text-[var(--color-ink-3)]" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">{label}</div>
        {sub && <div className="truncate text-[11px] text-[var(--color-ink-3)]">{sub}</div>}
      </div>
      <div className={`font-display text-sm font-bold tabular-nums ${color}`}>{main}</div>
    </div>
  )
}
