import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addMonths, format, parseISO } from 'date-fns'
import { supabase } from '@/shared/lib/supabase'

export interface PlusExtra {
  id: string
  empleado_id: string
  fecha: string
  importe: number
  concepto: string
  created_at: string
}

const QUERY_KEY = ['trabajadores', 'pluses-extra'] as const

const nextMonth = (mesISO: string) => format(addMonths(parseISO(mesISO), 1), 'yyyy-MM-dd')

const mapPlus = (row: Record<string, unknown>): PlusExtra => ({
  id: String(row.id),
  empleado_id: String(row.empleado_id),
  fecha: String(row.fecha),
  importe: Number(row.importe ?? 0),
  concepto: String(row.concepto),
  created_at: String(row.created_at),
})

export function usePlusesExtraMes(mesISO: string, empleadoId?: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...QUERY_KEY, mesISO, empleadoId ?? 'todos'] as const,
    enabled: options.enabled ?? true,
    queryFn: async (): Promise<PlusExtra[]> => {
      let query = supabase
        .from('trabajadores_pluses_extra')
        .select('id, empleado_id, fecha, importe, concepto, created_at')
        .gte('fecha', mesISO)
        .lt('fecha', nextMonth(mesISO))
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (empleadoId) query = query.eq('empleado_id', empleadoId)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map((row) => mapPlus(row as Record<string, unknown>))
    },
  })
}

export function useCrearPlusExtra() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { empleadoId: string; fecha: string; importe: number; concepto: string }) => {
      const { error } = await supabase
        .from('trabajadores_pluses_extra')
        .insert({
          empleado_id: input.empleadoId,
          fecha: input.fecha,
          importe: input.importe,
          concepto: input.concepto.trim(),
        })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useEliminarPlusExtra() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('trabajadores_pluses_extra')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
