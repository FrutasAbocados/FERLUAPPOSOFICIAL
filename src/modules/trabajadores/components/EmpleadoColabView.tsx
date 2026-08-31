import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Award, ChevronLeft, ChevronRight, Handshake, UsersRound } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import type { EmpleadoPropio } from '../lib/useEmpleadoPropio'
import { usePlusesExtraMes } from '../lib/pluses-extra-queries'
import { INCENTIVOS_TRABAJADORES_VISIBLES } from '../lib/features'

type SelfColab = {
  empleado_id: string
  nombre: string
  num_clientes: number
  facturacion_mes: number
  comision: number
}

type Detalle = {
  contact_id: string
  nombre: string
  facturacion: number
  comision: number
  asignado_desde: string | null
}

function num(v: unknown) { return Number(v ?? 0) }

function useSelfColab(mesISO: string) {
  return useQuery({
    queryKey: ['emp-colab-self', mesISO] as const,
    queryFn: async (): Promise<SelfColab | null> => {
      const { data, error } = await supabase.rpc('trabajadores_colaboraciones_self_mes', { p_mes: mesISO })
      if (error) throw error
      const row = ((data ?? []) as SelfColab[])[0]
      if (!row) return null
      return {
        ...row,
        num_clientes: num(row.num_clientes),
        facturacion_mes: num(row.facturacion_mes),
        comision: num(row.comision),
      }
    },
  })
}

function useDetalle(empleadoId: string, mesISO: string) {
  return useQuery({
    queryKey: ['emp-colab-detalle', empleadoId, mesISO] as const,
    queryFn: async (): Promise<Detalle[]> => {
      const { data, error } = await supabase.rpc('trabajadores_colaboraciones_detalle_mes', {
        p_empleado: empleadoId,
        p_mes: mesISO,
      })
      if (error) throw error
      return (data ?? []).map((r: Detalle) => ({
        ...r,
        facturacion: num(r.facturacion),
        comision: num(r.comision),
      }))
    },
  })
}

export function EmpleadoColabView({ empleado }: { empleado: EmpleadoPropio }) {
  const [mes, setMes] = useState<Date>(startOfMonth(new Date()))
  const mesISO = format(mes, 'yyyy-MM-dd')
  const mesLabel = format(mes, 'LLLL yyyy', { locale: es })
  const isCurrentMonth = mesISO === format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const resumen = useSelfColab(mesISO)
  const detalle = useDetalle(empleado.id, mesISO)
  const pluses = usePlusesExtraMes(mesISO, empleado.id, { enabled: INCENTIVOS_TRABAJADORES_VISIBLES })
  const totalPluses = (pluses.data ?? []).reduce((sum, plus) => sum + plus.importe, 0)

  return (
    <div className="ao-page max-w-3xl space-y-4 py-5 md:py-7">
      <header>
        <div className="flex items-center gap-2">
          <Handshake className="h-5 w-5" style={{ color: 'var(--mint)' }} />
          <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Mi colab</h1>
        </div>
        <p className="mt-1 text-xs text-[var(--ink-mute)]">
          {INCENTIVOS_TRABAJADORES_VISIBLES ? 'Comisiones por clientes y reconocimientos extraordinarios.' : 'Comisiones por clientes.'}
        </p>
      </header>

      <div className="ao-panel flex items-center justify-between gap-3 px-4 py-3">
        <Button size="sm" variant="outline" onClick={() => setMes(m => subMonths(m, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-display text-base font-bold capitalize text-[var(--ink)]">{mesLabel}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          disabled={isCurrentMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <section className="emp-hero-card">
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Comisión estimada</div>
              <div className="font-display text-5xl font-bold tabular-nums leading-none" style={{ color: 'var(--mint)' }}>
                {euros(resumen.data?.comision ?? 0)}
              </div>
            </div>
            <div className="text-right text-xs text-[var(--ink-mute)]">
              <div>Clientes: <span className="tabular-nums text-[var(--ink)]">{resumen.data?.num_clientes ?? 0}</span></div>
              <div>Facturación: <span className="tabular-nums text-[var(--ink)]">{euros(resumen.data?.facturacion_mes ?? 0)}</span></div>
              {INCENTIVOS_TRABAJADORES_VISIBLES && (
                <div>Pluses extra: <span className="tabular-nums text-[var(--mint)]">{euros(totalPluses)}</span></div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="ao-card overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <UsersRound className="h-4 w-4" style={{ color: 'var(--mint)' }} />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Clientes que cuentan este mes</h2>
        </div>
        {detalle.isLoading && <p className="p-4 text-sm text-[var(--ink-mute)]">Cargando…</p>}
        {!detalle.isLoading && (detalle.data?.length ?? 0) === 0 && (
          <p className="p-4 text-sm text-[var(--ink-mute)]">No tienes clientes asignados todavía.</p>
        )}
        <ul className="divide-y divide-[var(--line)]">
          {detalle.data?.map(d => (
            <li key={d.contact_id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--ink)]">{d.nombre}</div>
                <div className="text-xs text-[var(--ink-mute)]">
                  {d.asignado_desde ? `Desde ${format(parseISO(d.asignado_desde), 'd LLL yyyy', { locale: es })}` : 'Asignado'}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-base font-bold tabular-nums text-[var(--mint)]">{euros(d.comision)}</div>
                <div className="text-[10px] text-[var(--ink-mute)]">{euros(d.facturacion)}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {INCENTIVOS_TRABAJADORES_VISIBLES && <section className="ao-card overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-[var(--mint)]" />
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Pluses extraordinarios</h2>
              <p className="text-[10px] text-[var(--ink-mute)]">Reconocimientos puntuales del mes</p>
            </div>
          </div>
          <span className="font-display text-lg font-bold tabular-nums text-[var(--mint)]">{euros(totalPluses)}</span>
        </div>
        {pluses.isLoading && <p className="p-4 text-sm text-[var(--ink-mute)]">Cargando…</p>}
        {!pluses.isLoading && (pluses.data?.length ?? 0) === 0 && (
          <p className="p-4 text-sm text-[var(--ink-mute)]">No hay pluses extraordinarios este mes.</p>
        )}
        <ul className="divide-y divide-[var(--line)]">
          {pluses.data?.map((plus) => (
            <li key={plus.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">{plus.concepto}</p>
                <p className="text-xs text-[var(--ink-mute)]">{format(parseISO(plus.fecha), 'd LLL yyyy', { locale: es })}</p>
              </div>
              <span className="font-display text-base font-bold tabular-nums text-[var(--mint)]">{euros(plus.importe)}</span>
            </li>
          ))}
        </ul>
      </section>}
    </div>
  )
}
