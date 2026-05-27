import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Movimiento, TesoreriaKpis, TipoMovimiento } from './types'

const KEYS = {
  kpis:  (desde: string, hasta: string) => ['tesoreria', 'kpis', desde, hasta] as const,
  lista: (desde: string, hasta: string) => ['tesoreria', 'lista', desde, hasta] as const,
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function useTesoreriaKpis(desde: string, hasta: string) {
  return useQuery({
    queryKey: KEYS.kpis(desde, hasta),
    queryFn: async (): Promise<TesoreriaKpis> => {
      const { data, error } = await supabase.rpc('tesoreria_kpis', {
        p_desde: desde,
        p_hasta: hasta,
      })
      if (error) throw error
      const r = (data?.[0] ?? {}) as Record<string, unknown>
      return {
        saldo_total:      Number(r.saldo_total      ?? 0),
        entradas_periodo: Number(r.entradas_periodo ?? 0),
        salidas_periodo:  Number(r.salidas_periodo  ?? 0),
        count_periodo:    Number(r.count_periodo    ?? 0),
      }
    },
  })
}

export function useTesoreriaLista(desde: string, hasta: string) {
  return useQuery({
    queryKey: KEYS.lista(desde, hasta),
    queryFn: async (): Promise<Movimiento[]> => {
      const { data, error } = await supabase
        .from('tesoreria_movimientos')
        .select('*')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => ({
        id:         r.id,
        fecha:      r.fecha,
        tipo:       r.tipo as TipoMovimiento,
        concepto:   r.concepto,
        importe:    Number(r.importe ?? 0),
        categoria:  r.categoria ?? null,
        notas:      r.notas ?? null,
        cierre_id:  r.cierre_id ?? null,
        fuente:     r.fuente,
        ajuste:     r.ajuste ?? false,
        created_at: r.created_at,
      }))
    },
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

type MovimientoInput = {
  fecha:     string
  tipo:      TipoMovimiento
  concepto:  string
  importe:   number
  categoria?: string | null
  notas?:    string | null
}

export function useInsertMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: MovimientoInput) => {
      const { error } = await supabase.from('tesoreria_movimientos').insert({
        fecha:     input.fecha,
        tipo:      input.tipo,
        concepto:  input.concepto,
        importe:   input.importe,
        categoria: input.categoria ?? null,
        notas:     input.notas ?? null,
        fuente:    'manual',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}

type MovimientoUpdate = MovimientoInput & {
  id:        string
  cierre_id: string | null
  fuente:    string
  importe_original?: number
}

export function useUpdateMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: MovimientoUpdate) => {
      // Si edita importe en un movimiento de cierre → marca como ajuste
      const ajuste = input.fuente === 'cierre' ? true : undefined
      const { error } = await supabase
        .from('tesoreria_movimientos')
        .update({
          fecha:     input.fecha,
          tipo:      input.tipo,
          concepto:  input.concepto,
          importe:   input.importe,
          categoria: input.categoria ?? null,
          notas:     input.notas ?? null,
          ...(ajuste !== undefined ? { ajuste } : {}),
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}

export function useDeleteMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tesoreria_movimientos')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}
