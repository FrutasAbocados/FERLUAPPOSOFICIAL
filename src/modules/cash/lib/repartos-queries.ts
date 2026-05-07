import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type {
  ContactoOpt,
  EmpleadoOpt,
  Jornada,
  JornadaLinea,
  LineaInput,
} from './repartos-types'

// ── Empleados activos para el selector ───────────────────────────────────
export function useEmpleadosActivos() {
  return useQuery({
    queryKey: ['repartos', 'empleados-activos'] as const,
    queryFn: async (): Promise<EmpleadoOpt[]> => {
      const { data, error } = await supabase
        .from('empleados_equipo')
        .select('id, nombre, activo')
        .eq('activo', true)
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => ({ id: String(r.id), nombre: String(r.nombre) }))
    },
  })
}

// ── Buscador de clientes (manager_contactos) ─────────────────────────────
export function useBuscarContactos(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['repartos', 'contactos-search', q] as const,
    enabled: q.length >= 2,
    queryFn: async (): Promise<ContactoOpt[]> => {
      const { data, error } = await supabase
        .from('manager_contactos')
        .select('id, nombre')
        .ilike('nombre', `%${q}%`)
        .order('nombre', { ascending: true })
        .limit(20)
      if (error) throw error
      return (data ?? []).map((r) => ({ id: String(r.id), nombre: String(r.nombre) }))
    },
  })
}

// ── Jornadas de un día (todas las del repartidor + cabecera) ─────────────
export function useJornadasDia(fecha: string) {
  return useQuery({
    queryKey: ['repartos', 'jornadas-dia', fecha] as const,
    enabled: !!fecha,
    queryFn: async (): Promise<Jornada[]> => {
      const { data, error } = await supabase
        .from('repartos_jornada')
        .select('*')
        .eq('fecha', fecha)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Jornada[]
    },
  })
}

// ── Líneas de una jornada ───────────────────────────────────────────────
export function useJornadaLineas(jornadaId: string | null) {
  return useQuery({
    queryKey: ['repartos', 'jornada-lineas', jornadaId] as const,
    enabled: !!jornadaId,
    queryFn: async (): Promise<JornadaLinea[]> => {
      if (!jornadaId) return []
      const { data, error } = await supabase
        .from('repartos_jornada_lineas')
        .select('*')
        .eq('jornada_id', jornadaId)
        .order('orden', { ascending: true })
      if (error) throw error
      return (data ?? []) as JornadaLinea[]
    },
  })
}

// ── Resumen agregado del día (todas las jornadas) ───────────────────────
export type ResumenDia = {
  count: number
  total: number
  efectivo: number
  tarjeta: number
}

export function useResumenDia(fecha: string) {
  return useQuery({
    queryKey: ['repartos', 'resumen-dia', fecha] as const,
    enabled: !!fecha,
    queryFn: async (): Promise<ResumenDia> => {
      const { data, error } = await supabase
        .from('repartos_jornada_lineas')
        .select('importe, forma_pago, repartos_jornada!inner(fecha)')
        .eq('repartos_jornada.fecha', fecha)
      if (error) throw error
      const list = (data ?? []) as Array<{ importe: number; forma_pago: 'efectivo' | 'tarjeta' }>
      const total = list.reduce((s, l) => s + Number(l.importe), 0)
      const efectivo = list
        .filter((l) => l.forma_pago === 'efectivo')
        .reduce((s, l) => s + Number(l.importe), 0)
      return {
        count: list.length,
        total,
        efectivo,
        tarjeta: total - efectivo,
      }
    },
  })
}

// ── Crear jornada (cabecera) ────────────────────────────────────────────
export type CrearJornadaInput = {
  fecha: string
  empleado_id: string
  hora_inicio: string | null
  hora_fin: string | null
  notas: string | null
}

export function useCrearJornada() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CrearJornadaInput): Promise<Jornada> => {
      const { data, error } = await supabase
        .from('repartos_jornada')
        .insert(input)
        .select('*')
        .single()
      if (error) throw error
      return data as Jornada
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repartos'] })
    },
  })
}

// ── Actualizar jornada ──────────────────────────────────────────────────
export type ActualizarJornadaInput = Partial<CrearJornadaInput> & { id: string }

export function useActualizarJornada() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: ActualizarJornadaInput): Promise<Jornada> => {
      const { data, error } = await supabase
        .from('repartos_jornada')
        .update(rest)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as Jornada
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repartos'] })
    },
  })
}

// ── Borrar jornada (cascade líneas) ─────────────────────────────────────
export function useBorrarJornada() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('repartos_jornada').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repartos'] })
    },
  })
}

// ── Estadísticas Caja (RPC cash_stats_semanas) ──────────────────────────
export type StatsSemana = {
  semana_inicio: string  // 'YYYY-MM-DD' (lunes ISO)
  empleado_id: string
  empleado_nombre: string
  horas: number
  total: number
  efectivo: number
  tarjeta: number
  jornadas: number
}

export function useCashStatsSemanas(from: string, to: string) {
  return useQuery({
    queryKey: ['repartos', 'stats-semanas', from, to] as const,
    enabled: !!from && !!to,
    queryFn: async (): Promise<StatsSemana[]> => {
      const { data, error } = await supabase.rpc('cash_stats_semanas', {
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      type Raw = Omit<StatsSemana, 'horas' | 'total' | 'efectivo' | 'tarjeta' | 'jornadas'> & {
        horas: number | string
        total: number | string
        efectivo: number | string
        tarjeta: number | string
        jornadas: number | string
      }
      return (data ?? []).map((r: Raw) => ({
        semana_inicio: r.semana_inicio,
        empleado_id: r.empleado_id,
        empleado_nombre: r.empleado_nombre,
        horas: Number(r.horas),
        total: Number(r.total),
        efectivo: Number(r.efectivo),
        tarjeta: Number(r.tarjeta),
        jornadas: Number(r.jornadas),
      }))
    },
  })
}

// ── Reemplazar todas las líneas de una jornada (delete + insert) ────────
export function useGuardarLineas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      jornadaId,
      lineas,
    }: {
      jornadaId: string
      lineas: LineaInput[]
    }): Promise<void> => {
      const { error: errDel } = await supabase
        .from('repartos_jornada_lineas')
        .delete()
        .eq('jornada_id', jornadaId)
      if (errDel) throw errDel
      if (lineas.length === 0) return
      const rows = lineas.map((l, i) => ({
        jornada_id: jornadaId,
        contact_id: l.contact_id,
        contact_nombre: l.contact_nombre,
        importe: l.importe,
        forma_pago: l.forma_pago,
        orden: i,
      }))
      const { error: errIns } = await supabase.from('repartos_jornada_lineas').insert(rows)
      if (errIns) throw errIns
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repartos'] })
    },
  })
}
