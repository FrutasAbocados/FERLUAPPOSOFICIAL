import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'
import type { Empleado, ShiftType, Turno } from './types'
import { isoDate, shiftWeek, weekDays } from './week'

const TURNO_COLS = 'id, empleado_id, fecha, tipo, hora_inicio, hora_fin, notas'
const EMPLEADOS_KEY = ['turnos', 'empleados'] as const
const turnosKey = (anchor: Date) =>
  ['turnos', 'rango', isoDate(weekDays(anchor)[0])] as const

export function useEmpleados() {
  return useQuery({
    queryKey: EMPLEADOS_KEY,
    queryFn: async (): Promise<Empleado[]> => {
      const { data, error } = await supabase
        .from('empleados_equipo')
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
        .select(TURNO_COLS)
        .gte('fecha', from)
        .lte('fecha', to)
      if (error) throw error
      return (data ?? []) as Turno[]
    },
  })
}

/** Turnos de N semanas seguidas desde `anchor` (para que el equipo planifique). */
export function useTurnosRango(anchor: Date, semanas: number) {
  const from = isoDate(weekDays(anchor)[0])
  const to = isoDate(weekDays(shiftWeek(anchor, semanas - 1))[6])
  return useQuery({
    queryKey: ['turnos', 'rango', from, to] as const,
    queryFn: async (): Promise<Turno[]> => {
      const { data, error } = await supabase
        .from('turnos')
        .select(TURNO_COLS)
        .gte('fecha', from)
        .lte('fecha', to)
        .order('fecha')
      if (error) throw error
      return (data ?? []) as Turno[]
    },
  })
}

type SetTurnoArgs = {
  empleado_id: string
  fecha: string
  tipo: ShiftType | null
  hora_inicio?: string | null
  hora_fin?: string | null
  notas?: string | null
}

export function useSetTurno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ empleado_id, fecha, tipo, hora_inicio = null, hora_fin = null, notas = null }: SetTurnoArgs) => {
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
          { empleado_id, fecha, tipo, hora_inicio: hora_inicio || null, hora_fin: hora_fin || null, notas: notas?.trim() || null },
          { onConflict: 'empleado_id,fecha' },
        )
        .select(TURNO_COLS)
        .single()
      if (error) throw error
      return data as Turno
    },
    onSuccess: () => {
      // Prefijo común: refresca la semana del admin y los rangos de 4 semanas del equipo.
      qc.invalidateQueries({ queryKey: ['turnos', 'rango'] })
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
