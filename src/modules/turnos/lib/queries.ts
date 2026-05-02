import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'
import type { Empleado, ShiftType, Turno } from './types'
import { isoDate, weekDays } from './week'

const EMPLEADOS_KEY = ['turnos', 'empleados'] as const
const turnosKey = (anchor: Date) =>
  ['turnos', 'rango', isoDate(weekDays(anchor)[0])] as const

export function useEmpleados() {
  return useQuery({
    queryKey: EMPLEADOS_KEY,
    queryFn: async (): Promise<Empleado[]> => {
      const { data, error } = await supabase
        .from('empleados')
        .select('id, user_id, nombre, alias, color, activo, orden')
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data ?? []) as Empleado[]
    },
  })
}

export function useTurnosOfWeek(anchor: Date) {
  const days = weekDays(anchor)
  const from = isoDate(days[0])
  const to = isoDate(days[6])
  return useQuery({
    queryKey: turnosKey(anchor),
    queryFn: async (): Promise<Turno[]> => {
      const { data, error } = await supabase
        .from('turnos')
        .select('id, empleado_id, fecha, tipo, notas')
        .gte('fecha', from)
        .lte('fecha', to)
      if (error) throw error
      return (data ?? []) as Turno[]
    },
  })
}

type SetTurnoArgs = {
  empleado_id: string
  fecha: string
  tipo: ShiftType | null
  weekAnchor: Date
}

export function useSetTurno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ empleado_id, fecha, tipo }: SetTurnoArgs) => {
      if (tipo === null) {
        const { error } = await supabase
          .from('turnos')
          .delete()
          .eq('empleado_id', empleado_id)
          .eq('fecha', fecha)
        if (error) throw error
        return null
      }
      const { data, error } = await supabase
        .from('turnos')
        .upsert(
          { empleado_id, fecha, tipo },
          { onConflict: 'empleado_id,fecha' },
        )
        .select('id, empleado_id, fecha, tipo, notas')
        .single()
      if (error) throw error
      return data as Turno
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: turnosKey(vars.weekAnchor) })
    },
    onError: (e) => {
      toast({ title: 'No se pudo guardar el turno', description: e instanceof Error ? e.message : '', variant: 'error' })
    },
  })
}

type CreateEmpleadoArgs = {
  nombre: string
  alias?: string | null
}

export function useCreateEmpleado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ nombre, alias }: CreateEmpleadoArgs) => {
      const { data, error } = await supabase
        .from('empleados')
        .insert({ nombre, alias: alias ?? null })
        .select('id, user_id, nombre, alias, color, activo, orden')
        .single()
      if (error) throw error
      return data as Empleado
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLEADOS_KEY })
    },
  })
}
