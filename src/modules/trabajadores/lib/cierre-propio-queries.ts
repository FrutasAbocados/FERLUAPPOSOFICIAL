import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type {
  GastoInput,
  Jornada,
  JornadaGasto,
  JornadaLinea,
  LineaInput,
} from '@/modules/cash/lib/repartos-types'

export type MiCierre = {
  jornada: Jornada
  lineas: JornadaLinea[]
  gastos: JornadaGasto[]
} | null

// ── Cierre propio del repartidor para una fecha (origen='empleado') ──────
export function useMiCierre(empleadoId: string | undefined, fecha: string) {
  return useQuery({
    queryKey: ['cierre-empleado', empleadoId, fecha] as const,
    enabled: !!empleadoId && !!fecha,
    queryFn: async (): Promise<MiCierre> => {
      const { data: jorn, error: e1 } = await supabase
        .from('repartos_jornada')
        .select('*')
        .eq('empleado_id', empleadoId!)
        .eq('fecha', fecha)
        .eq('origen', 'empleado')
        .maybeSingle()
      if (e1) throw e1
      if (!jorn) return null
      const jornada = jorn as Jornada

      const { data: lineas, error: e2 } = await supabase
        .from('repartos_jornada_lineas')
        .select('*')
        .eq('jornada_id', jornada.id)
        .order('orden', { ascending: true })
      if (e2) throw e2

      const { data: gastos, error: e3 } = await supabase
        .from('repartos_jornada_gastos')
        .select('*')
        .eq('jornada_id', jornada.id)
        .order('orden', { ascending: true })
      if (e3) throw e3

      return {
        jornada,
        lineas: (lineas ?? []) as JornadaLinea[],
        gastos: (gastos ?? []) as JornadaGasto[],
      }
    },
  })
}

// ── Enviar (o reenviar) el cierre del día ────────────────────────────────
export type EnviarCierreInput = {
  fecha: string
  hora_inicio: string | null
  hora_fin: string | null
  notas: string | null
  efectivo_billetes: number | null
  efectivo_monedas: number | null
  lineas: LineaInput[]
  gastos: GastoInput[]
}

export function useEnviarCierre() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EnviarCierreInput): Promise<string> => {
      const { data, error } = await supabase.rpc('repartos_jornada_empleado_guardar', {
        p_fecha: input.fecha,
        p_hora_inicio: input.hora_inicio,
        p_hora_fin: input.hora_fin,
        p_notas: input.notas,
        p_efectivo_billetes: input.efectivo_billetes,
        p_efectivo_monedas: input.efectivo_monedas,
        p_lineas: input.lineas,
        p_gastos: input.gastos,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cierre-empleado'] })
      qc.invalidateQueries({ queryKey: ['repartos'] })
    },
  })
}
