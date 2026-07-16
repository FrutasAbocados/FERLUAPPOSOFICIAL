import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

export type IncidenciaTipo = 'incidencia' | 'falta' | 'abono' | 'otro'
export type IncidenciaEstado = 'pendiente' | 'en_proceso' | 'resuelta'

export type Incidencia = {
  id: string
  /** null = incidencia general del negocio (no asociada a un cliente concreto). */
  contact_name_canon: string | null
  fecha: string
  tipo: IncidenciaTipo
  descripcion: string
  estado: IncidenciaEstado
  autor_empleado_id: string | null
  autor_nombre: string | null
  resuelto_at: string | null
  resolucion_nota: string | null
  created_at: string
}

export type ClienteOpcion = { nombre_canon: string; poblacion: string | null }

/** ¿El usuario actual puede resolver incidencias? (admin o empleado con flag). */
export function usePuedeGestionarIncidencias() {
  return useQuery({
    queryKey: ['incidencias', 'puede-gestionar'] as const,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('puede_gestionar_incidencias')
      if (error) throw error
      return !!data
    },
  })
}

/** Lista de clientes canónicos para el selector (sin datos financieros). */
export function useClientesIncidencias() {
  return useQuery({
    queryKey: ['incidencias', 'clientes'] as const,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ClienteOpcion[]> => {
      const { data, error } = await supabase.rpc('incidencias_clientes_lista')
      if (error) throw error
      return (data ?? []) as ClienteOpcion[]
    },
  })
}

/** Tablero compartido de incidencias, opcionalmente filtrado por estado. */
export function useIncidencias(estado: IncidenciaEstado | 'todas') {
  return useQuery({
    queryKey: ['incidencias', 'lista', estado] as const,
    queryFn: async (): Promise<Incidencia[]> => {
      let q = supabase
        .from('incidencias')
        .select('id, contact_name_canon, fecha, tipo, descripcion, estado, autor_empleado_id, resuelto_at, resolucion_nota, created_at, empleados:autor_empleado_id(nombre)')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300)
      if (estado !== 'todas') q = q.eq('estado', estado)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as unknown as Array<Record<string, unknown> & { empleados: { nombre: string } | { nombre: string }[] | null }>).map(r => {
        const emp = Array.isArray(r.empleados) ? r.empleados[0] : r.empleados
        return {
          id: r.id as string,
          contact_name_canon: (r.contact_name_canon as string | null) ?? null,
          fecha: r.fecha as string,
          tipo: r.tipo as IncidenciaTipo,
          descripcion: r.descripcion as string,
          estado: r.estado as IncidenciaEstado,
          autor_empleado_id: (r.autor_empleado_id as string) ?? null,
          autor_nombre: emp?.nombre ?? null,
          resuelto_at: (r.resuelto_at as string) ?? null,
          resolucion_nota: (r.resolucion_nota as string) ?? null,
          created_at: r.created_at as string,
        }
      })
    },
  })
}

export function useCrearIncidencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      contact_name_canon: string | null
      fecha: string
      tipo: IncidenciaTipo
      descripcion: string
      autor_empleado_id: string | null
    }) => {
      const { error } = await supabase.from('incidencias').insert({
        contact_name_canon: input.contact_name_canon,
        fecha: input.fecha,
        tipo: input.tipo,
        descripcion: input.descripcion,
        autor_empleado_id: input.autor_empleado_id,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidencias', 'lista'] }),
  })
}

/** Resolver / reabrir / poner en proceso (solo gestor+admin por RLS). */
export function useActualizarEstadoIncidencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; estado: IncidenciaEstado; resolucion_nota?: string | null }) => {
      const { data: userData } = await supabase.auth.getUser()
      const resuelta = input.estado === 'resuelta'
      const { error } = await supabase
        .from('incidencias')
        .update({
          estado: input.estado,
          resolucion_nota: input.resolucion_nota ?? null,
          resuelto_por: resuelta ? (userData.user?.id ?? null) : null,
          resuelto_at: resuelta ? new Date().toISOString() : null,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidencias', 'lista'] }),
  })
}
