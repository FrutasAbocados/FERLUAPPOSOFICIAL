import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/shared/auth/useAuth'
import { supabase } from '@/shared/lib/supabase'

export interface EmpleadoPropio {
  id: string
  nombre: string
  pack: 1 | 2 | 3
  user_id: string
  activo: boolean
  puesto: string | null
}

export function useEmpleadoPropio() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['empleado-propio', profile?.id] as const,
    enabled: !!profile?.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EmpleadoPropio | null> => {
      const { data, error } = await supabase
        .from('empleados_equipo')
        .select('id, nombre, pack, user_id, activo, puesto')
        .eq('user_id', profile!.id)
        .eq('activo', true)
        .maybeSingle()
      if (error) throw error
      return data as EmpleadoPropio | null
    },
  })
}
