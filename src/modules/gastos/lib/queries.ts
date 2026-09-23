import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { EstadoDato, GrupoResumen, Naturaleza, Periodicidad } from './calc'

export interface Categoria {
  id: string
  nombre: string
  color: string | null
  orden: number
  activo: boolean
  grupo_resumen: GrupoResumen
}

export interface GastoFijo {
  id: string
  nombre: string
  persona: string | null
  importe: number | null
  comision: number
  periodicidad: Periodicidad
  estado_dato: EstadoDato
  naturaleza: Naturaleza
  categoria_id: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  activo: boolean
  notas: string | null
  orden: number
}

export type GastoFijoInput = Omit<GastoFijo, 'id'>

const FIJO_COLS =
  'id, nombre, persona, importe, comision, periodicidad, estado_dato, naturaleza, categoria_id, fecha_inicio, fecha_fin, activo, notas, orden'

const KEY_FIJOS = ['gastos', 'fijos'] as const
const KEY_CATEGORIAS = ['gastos', 'categorias'] as const

export function useCategorias() {
  return useQuery({
    queryKey: KEY_CATEGORIAS,
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase
        .from('gastos_categorias')
        .select('id, nombre, color, orden, activo, grupo_resumen')
        .order('orden')
      if (error) throw error
      return (data ?? []) as Categoria[]
    },
    staleTime: 5 * 60_000,
  })
}

export function useGastosFijos() {
  return useQuery({
    queryKey: KEY_FIJOS,
    queryFn: async (): Promise<GastoFijo[]> => {
      const { data, error } = await supabase
        .from('gastos_fijos')
        .select(FIJO_COLS)
        .order('orden')
        .order('nombre')
      if (error) throw error
      return (data ?? []).map((r) => ({
        ...(r as GastoFijo),
        importe: r.importe == null ? null : Number(r.importe),
        comision: Number(r.comision ?? 0),
      }))
    },
  })
}

export function useCrearGastoFijo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: GastoFijoInput) => {
      // iva_pct = 0: el importe ya incluye IVA.
      const { error } = await supabase.from('gastos_fijos').insert({ ...input, iva_pct: 0 })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_FIJOS }),
  })
}

/** Update optimista: la tabla recalcula totales al instante. */
export function useActualizarGastoFijo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<GastoFijoInput> }) => {
      const { error } = await supabase.from('gastos_fijos').update(patch).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: KEY_FIJOS })
      const prev = qc.getQueryData<GastoFijo[]>(KEY_FIJOS)
      qc.setQueryData<GastoFijo[]>(KEY_FIJOS, (old) => old?.map((g) => (g.id === id ? { ...g, ...patch } : g)))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY_FIJOS, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY_FIJOS }),
  })
}

export function useEliminarGastoFijo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastos_fijos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_FIJOS }),
  })
}
