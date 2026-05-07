import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Empleado } from '@/modules/turnos/lib/types'
import type { Tarea, TareaEstado, TareaInput } from './types'

const TAREAS_KEY = ['tareas', 'list'] as const
const EMPLEADOS_KEY = ['tareas', 'empleados'] as const

export function useTareas() {
  return useQuery({
    queryKey: TAREAS_KEY,
    queryFn: async (): Promise<Tarea[]> => {
      const { data, error } = await supabase
        .from('tareas')
        .select('*')
        .order('estado', { ascending: true })
        .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Tarea[]
    },
  })
}

export function useEmpleadosList() {
  return useQuery({
    queryKey: EMPLEADOS_KEY,
    queryFn: async (): Promise<Empleado[]> => {
      const { data, error } = await supabase
        .from('empleados_equipo')
        .select('id, user_id, nombre, alias, color, activo, orden')
        .eq('activo', true)
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data ?? []) as Empleado[]
    },
  })
}

export function useCreateTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TareaInput): Promise<Tarea> => {
      const { data, error } = await supabase
        .from('tareas')
        .insert(input)
        .select('*')
        .single()
      if (error) throw error
      return data as Tarea
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }),
  })
}

export function useUpdateTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<TareaInput> & { estado?: TareaEstado }
    }): Promise<Tarea> => {
      const { data, error } = await supabase
        .from('tareas')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as Tarea
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }),
  })
}

export function useDeleteTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('tareas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }),
  })
}
