import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { BadgeEuro, Loader2, Sparkles } from 'lucide-react'
import { euros } from '@/shared/lib/format'
import { supabase } from '@/shared/lib/supabase'

type BeneficiosMes = {
  plusesFijos: number
  colaboraciones: number
  plusesExtra: number
  objetivo: number
  horasExtra: number
  pedidosTarde: number
}

const num = (value: unknown): number => Number(value ?? 0)

function useBeneficiosMes(empleadoId: string, mesISO: string, finISO: string) {
  return useQuery({
    queryKey: ['trabajadores', 'beneficios-self', empleadoId, mesISO] as const,
    queryFn: async (): Promise<BeneficiosMes> => {
      const [empleado, colaboraciones, pluses, objetivo, horas, pedidos] = await Promise.all([
        supabase
          .from('empleados')
          .select('plus_transporte, plus_responsabilidad, plus_otros')
          .eq('id', empleadoId)
          .single(),
        supabase.rpc('trabajadores_colaboraciones_self_mes', { p_mes: mesISO }),
        supabase
          .from('trabajadores_pluses_extra')
          .select('importe')
          .eq('empleado_id', empleadoId)
          .gte('fecha', mesISO)
          .lt('fecha', finISO),
        supabase
          .from('empleado_objetivo_mes')
          .select('cumplido, importe_aplicado, empleado_objetivos!inner(empleado_id, activo)')
          .eq('mes', mesISO)
          .eq('empleado_objetivos.empleado_id', empleadoId)
          .eq('empleado_objetivos.activo', true)
          .limit(1)
          .maybeSingle(),
        supabase.rpc('trabajadores_horas_extras_resumen_self', { p_mes: mesISO }),
        supabase
          .from('trabajadores_pedidos_tarde_facturas')
          .select('beneficio')
          .gte('fecha', mesISO)
          .lt('fecha', finISO),
      ])

      const error = empleado.error || colaboraciones.error || pluses.error || objetivo.error || horas.error || pedidos.error
      if (error) throw error

      const colabRow = (colaboraciones.data ?? [])[0] as Record<string, unknown> | undefined
      const objetivoRow = objetivo.data as { cumplido?: boolean; importe_aplicado?: unknown } | null
      const horasRow = (horas.data ?? [])[0] as Record<string, unknown> | undefined

      return {
        plusesFijos:
          num(empleado.data.plus_transporte)
          + num(empleado.data.plus_responsabilidad)
          + num(empleado.data.plus_otros),
        colaboraciones: num(colabRow?.comision),
        plusesExtra: (pluses.data ?? []).reduce((sum, row) => sum + num(row.importe), 0),
        objetivo: objetivoRow?.cumplido ? num(objetivoRow.importe_aplicado) : 0,
        horasExtra: num(horasRow?.importe_pago_pendiente) + num(horasRow?.importe_pago_liquidado),
        pedidosTarde: (pedidos.data ?? []).reduce((sum, row) => sum + num(row.beneficio) * 0.8, 0),
      }
    },
  })
}

export function EmpleadoBeneficiosMesCard({
  empleadoId,
  puntosEuros,
}: {
  empleadoId: string
  puntosEuros: number
}) {
  const inicio = startOfMonth(new Date())
  const mesISO = format(inicio, 'yyyy-MM-dd')
  const finISO = format(new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1), 'yyyy-MM-dd')
  const beneficios = useBeneficiosMes(empleadoId, mesISO, finISO)

  if (beneficios.isLoading) {
    return (
      <section className="ao-card mb-3 flex items-center justify-center gap-2 px-4 py-6 text-sm text-[var(--ink-mute)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando beneficios del mes…
      </section>
    )
  }

  if (beneficios.isError || !beneficios.data) {
    return (
      <section className="ao-card mb-3 px-4 py-4 text-sm text-red-400">
        No se pudo calcular el total de beneficios del mes.
      </section>
    )
  }

  const conceptos = [
    { label: 'Pluses fijos', value: beneficios.data.plusesFijos },
    { label: 'Colab', value: beneficios.data.colaboraciones },
    { label: 'Extraordinarios', value: beneficios.data.plusesExtra },
    { label: 'Puntos', value: puntosEuros },
    { label: 'Objetivo confirmado', value: beneficios.data.objetivo },
    { label: 'Horas extra aprobadas', value: beneficios.data.horasExtra },
    { label: 'Pedidos de tarde', value: beneficios.data.pedidosTarde },
  ]
  const total = conceptos.reduce((sum, concepto) => sum + concepto.value, 0)

  return (
    <section className="ao-card mb-3 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[var(--radius)] bg-[var(--mint-glow)] text-[var(--mint)]">
            <BadgeEuro className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--mint)]">Beneficios acumulados</p>
            <h2 className="text-sm font-semibold capitalize text-[var(--ink)]">
              {format(inicio, 'LLLL yyyy', { locale: es })}
            </h2>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Total del mes</p>
          <p className="font-display text-2xl font-bold tabular-nums text-[var(--mint)]">{euros(total)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-[var(--line)] sm:grid-cols-4">
        {conceptos.map((concepto) => (
          <div key={concepto.label} className="bg-[var(--panel)] px-3 py-2.5">
            <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-[var(--ink-mute)]">{concepto.label}</p>
            <p className="mt-0.5 font-display text-base font-bold tabular-nums text-[var(--ink)]">{euros(concepto.value)}</p>
          </div>
        ))}
        <div className="flex items-center gap-2 bg-[var(--panel)] px-3 py-2.5 text-[10px] leading-snug text-[var(--ink-mute)]">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--mint)]" />
          Sin sueldo base ni crédito de fruta.
        </div>
      </div>
    </section>
  )
}
