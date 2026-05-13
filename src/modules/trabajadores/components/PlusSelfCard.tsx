import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Percent } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'

type Resumen = {
  empleado_id: string
  nombre: string
  num_clientes: number
  facturacion_mes: number
  comision: number
}

function num(v: unknown): number { return Number(v ?? 0) }

export function PlusSelfCard() {
  const mesISO = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery({
    queryKey: ['trab-plus-self', mesISO] as const,
    queryFn: async (): Promise<Resumen | null> => {
      const { data, error } = await supabase.rpc('trabajadores_colaboraciones_self_mes', { p_mes: mesISO })
      if (error) throw error
      const rows = (data ?? []) as Resumen[]
      if (rows.length === 0) return null
      const r = rows[0]
      return {
        ...r,
        num_clientes: num(r.num_clientes),
        facturacion_mes: num(r.facturacion_mes),
        comision: num(r.comision),
      }
    },
  })

  if (isLoading) return null
  if (!data) return null

  const tieneClientes = data.num_clientes > 0

  return (
    <section className="mb-3 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <Percent className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">Tu plus 5%</div>
            <div className="text-xs text-emerald-700">{format(new Date(mesISO), "LLLL yyyy", { locale: es })}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold tabular-nums text-emerald-700">{euros(data.comision)}</div>
          <div className="text-[10px] uppercase tracking-wider text-emerald-700/70">
            {tieneClientes
              ? `${data.num_clientes} cliente(s) · ${euros(data.facturacion_mes)}`
              : 'sin clientes asignados'}
          </div>
        </div>
      </div>
    </section>
  )
}
