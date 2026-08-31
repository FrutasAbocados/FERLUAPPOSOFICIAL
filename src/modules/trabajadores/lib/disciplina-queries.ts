import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

export type Gravedad = 'leve' | 'grave'

export type ParteDisciplinario = {
  id: string
  empleado_id: string
  fecha: string
  gravedad: Gravedad
  motivo: string
  nota: string | null
  created_at: string
}

/**
 * Contadores del mes tal y como los calcula la BD.
 * Admin y trabajador consumen esta MISMA RPC para que nunca descuadren.
 */
export type DisciplinaResumen = {
  empleado_id: string
  nombre: string
  leves: number
  graves_directos: number
  graves_por_leves: number
  graves_totales: number
  leves_sueltos: number
  graves_pendientes: number
  leves_para_grave: number
  graves_para_falta: number
  faltas: number
  importe_falta: number
  descuento: number
}

const primerDiaMes = (mesISO: string) => `${mesISO.slice(0, 7)}-01`

const siguienteMes = (mesISO: string) => {
  const [year, month] = mesISO.slice(0, 7).split('-').map(Number)
  const next = new Date(Date.UTC(year, month, 1))
  return next.toISOString().slice(0, 10)
}

export function useDisciplinaResumenMes(mesISO: string) {
  return useQuery({
    queryKey: ['disciplina', 'resumen', primerDiaMes(mesISO)] as const,
    queryFn: async (): Promise<DisciplinaResumen[]> => {
      const { data, error } = await supabase.rpc('trabajadores_disciplina_resumen_mes', {
        p_mes: primerDiaMes(mesISO),
      })
      if (error) throw error
      return (data ?? []) as DisciplinaResumen[]
    },
  })
}

/** Partes del mes. RLS decide el alcance: admin ve todos, el trabajador solo los suyos. */
export function useDisciplinaPartesMes(mesISO: string) {
  const desde = primerDiaMes(mesISO)
  return useQuery({
    queryKey: ['disciplina', 'partes', desde] as const,
    queryFn: async (): Promise<ParteDisciplinario[]> => {
      const { data, error } = await supabase
        .from('trabajadores_disciplina')
        .select('id, empleado_id, fecha, gravedad, motivo, nota, created_at')
        .gte('fecha', desde)
        .lt('fecha', siguienteMes(mesISO))
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ParteDisciplinario[]
    },
  })
}

function useInvalidarDisciplina() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['disciplina'] })
}

export function useCrearParte() {
  const invalidar = useInvalidarDisciplina()
  return useMutation({
    mutationFn: async (input: {
      empleadoId: string
      fecha: string
      gravedad: Gravedad
      motivo: string
      nota: string | null
    }) => {
      const { error } = await supabase.from('trabajadores_disciplina').insert({
        empleado_id: input.empleadoId,
        fecha: input.fecha,
        gravedad: input.gravedad,
        motivo: input.motivo.trim(),
        nota: input.nota?.trim() ? input.nota.trim() : null,
      })
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useEliminarParte() {
  const invalidar = useInvalidarDisciplina()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trabajadores_disciplina').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}
