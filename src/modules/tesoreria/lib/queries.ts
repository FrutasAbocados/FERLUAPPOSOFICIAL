import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { EventoTesoreria, Movimiento, SobreResumen, TesoreriaKpis, TipoMovimiento } from './types'

const KEYS = {
  kpis:  (desde: string, hasta: string) => ['tesoreria', 'kpis', desde, hasta] as const,
  lista: (desde: string, hasta: string) => ['tesoreria', 'lista', desde, hasta] as const,
}

const INICIO_OPERATIVO_CONCEPTO = 'Ajuste de apertura · Inicio 14/07/2026'

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
      const { data: inicio, error: inicioError } = await supabase
        .from('tesoreria_movimientos')
        .select('created_at')
        .eq('concepto', INICIO_OPERATIVO_CONCEPTO)
        .eq('ajuste', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (inicioError) throw inicioError

      let movimientosQuery = supabase
        .from('tesoreria_movimientos')
        .select('*')
        .gte('fecha', desde)
        .lte('fecha', hasta)

      if (inicio?.created_at) {
        movimientosQuery = movimientosQuery.gt('created_at', inicio.created_at)
      }

      const { data, error } = await movimientosQuery
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => ({
        sobre_id:   r.sobre_id ?? null,
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
  sobre_id:  string | null
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
        sobre_id:  input.sobre_id,
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
          sobre_id:  input.sobre_id,
          ...(ajuste !== undefined ? { ajuste } : {}),
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}

export function useSobres(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['tesoreria', 'sobres', desde, hasta] as const,
    queryFn: async (): Promise<SobreResumen[]> => {
      const { data, error } = await supabase.rpc('tesoreria_sobres_resumen', {
        p_desde: desde, p_hasta: hasta,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id), nombre: String(r.nombre),
        salidas_total: Number(r.salidas_total ?? 0),
        devoluciones_total: Number(r.devoluciones_total ?? 0),
        acumulado: Number(r.acumulado ?? 0),
        neto_periodo: Number(r.neto_periodo ?? 0),
        movimientos: Number(r.movimientos ?? 0),
      }))
    },
  })
}

export function useSobreMovimientos(sobreId: string) {
  return useQuery({
    queryKey: ['tesoreria', 'sobre-movimientos', sobreId] as const,
    queryFn: async (): Promise<Movimiento[]> => {
      const { data: inicio, error: inicioError } = await supabase
        .from('tesoreria_movimientos')
        .select('created_at')
        .eq('concepto', INICIO_OPERATIVO_CONCEPTO)
        .eq('ajuste', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (inicioError) throw inicioError

      const movimientos: Movimiento[] = []
      const pageSize = 500
      for (let offset = 0; ; offset += pageSize) {
        let query = supabase.from('tesoreria_movimientos')
          .select('*', { count: 'exact' })
          .eq('sobre_id', sobreId)
        if (inicio?.created_at) query = query.gt('created_at', inicio.created_at)
        const { data, error, count } = await query
          .order('fecha', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + pageSize - 1)
        if (error) throw error
        movimientos.push(...(data ?? []).map(r => ({ ...r, importe: Number(r.importe ?? 0) } as Movimiento)))
        if (movimientos.length === count) return movimientos
        if (!data?.length || data.length < pageSize) {
          throw new Error('No se pudo cargar el historial completo del sobre. Vuelve a intentarlo.')
        }
      }
    },
  })
}

export function useGuardarSobre() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nombre, acumulado, acumuladoOriginal }: { id?: string; nombre: string; acumulado?: number; acumuladoOriginal?: number }) => {
      if (id) {
        const { error } = await supabase.rpc('tesoreria_editar_sobre', {
          p_id: id, p_nombre: nombre.trim(), p_acumulado: acumulado,
          p_acumulado_original: acumuladoOriginal,
        })
        if (error) throw error
        return id
      }
      const { data, error } = await supabase.from('tesoreria_sobres').insert({ nombre: nombre.trim() }).select('id').single()
      if (error) throw error
      return String(data.id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}

export function useBorrarSobre() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tesoreria_sobres').delete().eq('id', id)
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

export function useTesoreriaHistorial() {
  return useInfiniteQuery({
    queryKey: ['tesoreria', 'historial'] as const,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<EventoTesoreria[]> => {
      let query = supabase.from('tesoreria_historial').select('*').order('id', { ascending: false }).limit(50)
      if (pageParam !== null) query = query.lt('id', pageParam)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map(r => ({ ...r, id: Number(r.id) } as EventoTesoreria))
    },
    getNextPageParam: page => page.length === 50 ? page.at(-1)!.id : undefined,
  })
}

export function useRestaurarMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ evento, motivo }: { evento: number; motivo: string }) => {
      const { error } = await supabase.rpc('tesoreria_restaurar_movimiento', { p_evento: evento, p_motivo: motivo })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}
