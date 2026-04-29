import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

export type NotificacionTipo =
  | 'vacaciones_solicitada'
  | 'vacaciones_aprobada'
  | 'vacaciones_denegada'
  | 'puntos_dia'
  | 'tarea_completada'
  | 'motivacion_ia'
  | 'penalizacion_ia'
  | 'neutral_ia'
  | string

export interface Notificacion {
  id: string
  audience: 'admin' | 'empleado'
  empleado_id: string | null
  tipo: NotificacionTipo
  titulo: string
  cuerpo: string | null
  payload: Record<string, unknown>
  created_at: string
}

export function useNotificaciones() {
  return useQuery({
    queryKey: ['notificaciones'],
    queryFn: async (): Promise<Notificacion[]> => {
      const { data, error } = await supabase.rpc('notificaciones_listar')
      if (error) throw error
      return (data ?? []) as Notificacion[]
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
}

export function useMarcarLeida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notificaciones').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  })
}

export function useMarcarTodasLeidas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return
      const { error } = await supabase.from('notificaciones').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  })
}
