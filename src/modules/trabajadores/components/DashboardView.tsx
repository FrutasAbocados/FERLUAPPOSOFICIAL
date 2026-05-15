import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Award } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { useAuth } from '@/shared/auth/useAuth'
import { ColaboradoresView } from './ColaboradoresView'
import { EmpleadoHero } from './EmpleadoHero'
import { useEmpleadoPropio } from '../lib/useEmpleadoPropio'

interface Empleado {
  id: string
  nombre: string
  pack: 1 | 2 | 3
  user_id: string | null
  activo: boolean
  puesto: string | null
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
interface PuntoDia {
  total: number | null
  puntualidad: number | null
  reparto: number | null
  responsabilidad: number | null
}

interface AjustePuntos {
  delta_pts: number | null
}

interface CanjePuntos {
  puntos_gastados: number | null
}

interface CreditoMesFila {
  limite_base: number
  exceso_arrastrado: number
  gastado: number
  disponible: number
  exceso_nuevo: number
}

const eur = euros

function num(v: unknown): number { return Number(v ?? 0) }
function puntosAEuros(puntos: number): number {
  if (puntos >= 140) return 150
  if (puntos >= 120) return 100
  if (puntos >= 100) return 50
  return 0
}

function siguienteMes(mesISO: string): string {
  const d = new Date(mesISO)
  return format(new Date(d.getFullYear(), d.getMonth() + 1, 1), 'yyyy-MM-dd')
}

export function DashboardView({ modoEmpleado = false }: { modoEmpleado?: boolean }) {
  const { profile } = useAuth()
  const isAdmin = !modoEmpleado && profile?.role !== 'empleado'

  const mesISO = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const mesFinISO = siguienteMes(mesISO)
  const empleadoPropio = useEmpleadoPropio(modoEmpleado)

  const { data: puntosPropios } = useQuery({
    queryKey: ['dash-trab-self-puntos', empleadoPropio.data?.id, mesISO] as const,
    enabled: modoEmpleado && !!empleadoPropio.data?.id,
    queryFn: async (): Promise<PuntosFila | null> => {
      const empleadoId = empleadoPropio.data!.id
      const [diasRes, ajustesRes, canjesRes] = await Promise.all([
        supabase
          .from('trabajadores_puntos_dias')
          .select('total, puntualidad, reparto, responsabilidad')
          .eq('empleado_id', empleadoId)
          .gte('fecha', mesISO)
          .lt('fecha', mesFinISO),
        supabase
          .from('trabajadores_puntos_ajustes')
          .select('delta_pts')
          .eq('empleado_id', empleadoId)
          .gte('fecha', mesISO)
          .lt('fecha', mesFinISO),
        supabase
          .from('trabajadores_ruleta_canjes')
          .select('puntos_gastados')
          .eq('empleado_id', empleadoId)
          .gte('fecha', mesISO)
          .lt('fecha', mesFinISO),
      ])
      if (diasRes.error) throw diasRes.error
      if (ajustesRes.error) throw ajustesRes.error
      if (canjesRes.error) throw canjesRes.error

      const base = ((diasRes.data ?? []) as PuntoDia[]).reduce((acc, r) => acc + num(r.total), 0)
      const ajustes = ((ajustesRes.data ?? []) as AjustePuntos[]).reduce((acc, r) => acc + num(r.delta_pts), 0)
      const canjes = ((canjesRes.data ?? []) as CanjePuntos[]).reduce((acc, r) => acc + num(r.puntos_gastados), 0)
      const total = Math.max(base + ajustes - canjes, 0)

      return {
        empleado_id: empleadoId,
        total_puntos: total,
        euros: puntosAEuros(total),
      }
    },
  })

  const { data: creditoPropio } = useQuery({
    queryKey: ['dash-trab-self-credito', empleadoPropio.data?.id, mesISO] as const,
    enabled: modoEmpleado && !!empleadoPropio.data?.id && (empleadoPropio.data?.pack === 1 || empleadoPropio.data?.pack === 3),
    queryFn: async (): Promise<CreditoFila | null> => {
      const empleadoId = empleadoPropio.data!.id
      const { data, error } = await supabase.rpc('trabajadores_credito_estado_mes', {
        p_empleado_id: empleadoId,
        p_mes: mesISO,
      })
      if (error) throw error
      const row = ((data ?? []) as CreditoMesFila[])[0]
      if (!row) return null
      return {
        empleado_id: empleadoId,
        limite_base: num(row.limite_base),
        gastado: num(row.gastado),
        disponible: num(row.disponible),
        exceso_arrastrado: num(row.exceso_arrastrado),
      }
    },
  })

  const { data: empleados } = useQuery({
    queryKey: ['dash-trab-empleados'] as const,
    enabled: !modoEmpleado,
    queryFn: async (): Promise<Empleado[]> => {
      const { data, error } = await supabase
        .from('empleados_equipo')
        .select('id, nombre, pack, user_id, activo, puesto')
        .eq('activo', true)
        .order('nombre')
      if (error) throw error
      return (data ?? []) as Empleado[]
    },
  })

  const { data: puntos } = useQuery({
    queryKey: ['dash-trab-puntos', mesISO] as const,
    enabled: !modoEmpleado,
    queryFn: async (): Promise<PuntosFila[]> => {
      const { data, error } = await supabase.rpc('trabajadores_puntos_resumen_mes', { p_mes: mesISO })
      if (error) throw error
      return (data ?? []).map((r: PuntosFila) => ({ ...r, total_puntos: num(r.total_puntos), euros: num(r.euros) }))
    },
  })

  // Ranking puntos (entre todos pack 1)
  const ranking = useMemo(() => {
    return (puntos ?? [])
      .slice()
      .sort((a, b) => num(b.total_puntos) - num(a.total_puntos))
      .map((p, i) => ({ id: p.empleado_id, posicion: i + 1, total_puntos: num(p.total_puntos), euros: num(p.euros) }))
  }, [puntos])

  /* ── Vista empleado: hero personalizado ── */
  if (!isAdmin) {
    const e = empleadoPropio.data ?? null
    const pts = e ? puntosPropios : null
    const cr  = e ? creditoPropio : null

    return (
      <div className="ao-page py-5 md:py-6">
        {e ? (
          <EmpleadoHero
            empleadoId={e.id}
            nombre={e.nombre}
            pack={e.pack}
            puesto={e.puesto}
            puntosMes={pts?.total_puntos ?? 0}
            puntosEuros={pts?.euros ?? 0}
            creditoDisponible={cr?.disponible ?? null}
            creditoGastado={cr?.gastado ?? null}
            creditoLimite={cr?.limite_base ?? null}
          />
        ) : (
          <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-sm text-[var(--color-ink-3)]">
            Tu cuenta no está vinculada a un trabajador. Avisa a Luis o Álvaro.
          </p>
        )}
      </div>
    )
  }

  /* ── Vista admin/responsable ── */
  return (
    <div className="ao-page py-5 md:py-7">
      <header className="mb-5 border-b border-[var(--line)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Trabajadores</p>
        <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Dashboard</h1>
        <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
          {`Resumen del equipo · ${format(new Date(), 'LLLL yyyy', { locale: es })}.`}
        </p>
      </header>

      {/* Ranking puntos */}
      {ranking.length > 0 && ranking.some(r => r.total_puntos > 0) && (
        <section className="ao-card mb-5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">Ranking de puntos del mes</h2>
          </div>
          <ol className="space-y-1">
            {ranking.filter(r => r.total_puntos > 0).map(r => {
              const e = empleados?.find(x => x.id === r.id)
              if (!e) return null
              return (
                <li key={r.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-2,#f8fafc)]">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    r.posicion === 1 ? 'bg-[oklch(88%_.11_82_/_0.9)] text-[oklch(34%_.1_72)] dark:bg-[oklch(28%_.08_72_/_0.55)] dark:text-[var(--color-primary)]' :
                    r.posicion === 2 ? 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)]' :
                    r.posicion === 3 ? 'bg-[oklch(89%_.1_45_/_0.8)] text-[oklch(36%_.11_45)] dark:bg-[oklch(28%_.08_45_/_0.45)] dark:text-[oklch(78%_.12_45)]' :
                    'bg-[var(--color-surface-2)] text-[var(--color-ink-3)]'
                  }`}>{r.posicion}</span>
                  <span className="text-[var(--color-ink)]">{e.nombre}</span>
                  <span className="tabular-nums text-[var(--color-ink-3)]">{r.total_puntos} pts</span>
                  <span className="tabular-nums font-semibold text-[var(--mint)]">{eur(r.euros)}</span>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <ColaboradoresView />
    </div>
  )
}
