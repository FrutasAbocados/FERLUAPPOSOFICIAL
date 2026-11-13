import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { MermaUnidad } from './merma-dictado'

export type MermaOrigen = 'manual' | 'voz'

export interface MermaRegistro {
  id: string
  empleado_id: string
  empleado_nombre: string | null
  fecha: string
  referencia: string
  /** Cantidad en la unidad indicada (kg salvo manojo, bolsa…). */
  peso_kg: number
  unidad: MermaUnidad
  origen: MermaOrigen
  created_at: string
}

export interface MermaLineaNueva {
  referencia: string
  peso_kg: number
  unidad: MermaUnidad
  origen: MermaOrigen
}

/** Fecha de hoy en Madrid (YYYY-MM-DD). Nunca toISOString(). */
export const hoyMadrid = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())

/** ¿El usuario actual tiene la merma activada en su ficha? */
export function useMermaActiva(enabled = true) {
  return useQuery({
    queryKey: ['trabajadores', 'merma', 'activa'] as const,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('merma_activa')
      if (error) throw error
      return !!data
    },
  })
}

export function useMermaReferencias(enabled = true) {
  return useQuery({
    queryKey: ['trabajadores', 'merma', 'referencias'] as const,
    enabled,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('merma_referencias')
      if (error) throw error
      return ((data ?? []) as { referencia: string }[]).map(r => r.referencia)
    },
  })
}

type FilaCruda = Record<string, unknown> & {
  empleados: { nombre: string } | { nombre: string }[] | null
}

const mapRegistro = (r: FilaCruda): MermaRegistro => {
  const emp = Array.isArray(r.empleados) ? r.empleados[0] : r.empleados
  return {
    id: String(r.id),
    empleado_id: String(r.empleado_id),
    empleado_nombre: emp?.nombre ?? null,
    fecha: String(r.fecha),
    referencia: String(r.referencia),
    peso_kg: Number(r.peso_kg ?? 0),
    unidad: ((r.unidad as MermaUnidad | null) ?? 'kg'),
    origen: r.origen as MermaOrigen,
    created_at: String(r.created_at),
  }
}

/** Registros entre dos fechas (incluidas). RLS limita al empleado a lo suyo. */
export function useMermaRegistros(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['trabajadores', 'merma', 'registros', desde, hasta] as const,
    queryFn: async (): Promise<MermaRegistro[]> => {
      const { data, error } = await supabase
        .from('trabajadores_merma')
        .select('id, empleado_id, fecha, referencia, peso_kg, unidad, origen, created_at, empleados:empleado_id(nombre)')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      return ((data ?? []) as FilaCruda[]).map(mapRegistro)
    },
  })
}

export function useGuardarMerma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ empleadoId, lineas }: { empleadoId: string; lineas: MermaLineaNueva[] }) => {
      const filas = lineas.map(l => ({
        empleado_id: empleadoId,
        referencia: l.referencia.trim(),
        peso_kg: Math.round(l.peso_kg * 1000) / 1000,
        unidad: l.unidad,
        origen: l.origen,
      }))
      const { error } = await supabase.from('trabajadores_merma').insert(filas)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trabajadores', 'merma', 'registros'] }),
  })
}

export function useBorrarMerma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('trabajadores_merma').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Solo se puede borrar la merma de hoy.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trabajadores', 'merma', 'registros'] }),
  })
}

export * from './merma-dictado'
