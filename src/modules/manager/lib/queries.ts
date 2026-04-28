import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Period } from './period'
import type {
  ResumenPeriodo, SerieDiariaPunto, SyncLog,
  TopClienteMargen, TopProductoMargen,
} from './types'

const periodKey = (p: Period) => `${p.from}_${p.to}`

// ── KPIs agregados del periodo ────────────────────────────────────────────
export function useResumen(period: Period) {
  return useQuery({
    queryKey: ['manager', 'resumen', periodKey(period)] as const,
    queryFn: async (): Promise<ResumenPeriodo> => {
      const { data, error } = await supabase.rpc('manager_resumen_periodo', {
        p_from: period.from,
        p_to: period.to,
      })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
      return {
        ventas_n:         Number(row?.ventas_n ?? 0),
        ventas_subtotal:  Number(row?.ventas_subtotal ?? 0),
        ventas_total:     Number(row?.ventas_total ?? 0),
        pendiente_cobro:  Number(row?.pendiente_cobro ?? 0),
        compras_n:        Number(row?.compras_n ?? 0),
        compras_subtotal: Number(row?.compras_subtotal ?? 0),
        compras_total:    Number(row?.compras_total ?? 0),
        cogs:             Number(row?.cogs ?? 0),
        ventas_lineas:    Number(row?.ventas_lineas ?? 0),
        margen_real:      Number(row?.margen_real ?? 0),
        margen_pct:       row?.margen_pct == null ? null : Number(row.margen_pct),
      }
    },
  })
}

// ── Top clientes por margen € ─────────────────────────────────────────────
export function useTopClientesMargen(period: Period, limit = 10) {
  return useQuery({
    queryKey: ['manager', 'topClientes', periodKey(period), limit] as const,
    queryFn: async (): Promise<TopClienteMargen[]> => {
      const { data, error } = await supabase.rpc('manager_top_clientes_margen', {
        p_from: period.from,
        p_to: period.to,
        p_limit: limit,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        contact_name_canon: String(r.contact_name_canon ?? '(sin contacto)'),
        docs:               Number(r.docs ?? 0),
        unidades:           Number(r.unidades ?? 0),
        ventas:             Number(r.ventas ?? 0),
        cogs:               Number(r.cogs ?? 0),
        margen:             Number(r.margen ?? 0),
        margen_pct:         r.margen_pct == null ? null : Number(r.margen_pct),
      }))
    },
  })
}

// ── Top productos por margen € ────────────────────────────────────────────
export function useTopProductosMargen(period: Period, limit = 10) {
  return useQuery({
    queryKey: ['manager', 'topProductos', periodKey(period), limit] as const,
    queryFn: async (): Promise<TopProductoMargen[]> => {
      const { data, error } = await supabase.rpc('manager_top_productos_margen', {
        p_from: period.from,
        p_to: period.to,
        p_limit: limit,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        nombre:     String(r.nombre ?? '(sin nombre)'),
        product_id: r.product_id == null ? null : String(r.product_id),
        unidades:   Number(r.unidades ?? 0),
        ventas:     Number(r.ventas ?? 0),
        cogs:       Number(r.cogs ?? 0),
        margen:     Number(r.margen ?? 0),
        margen_pct: r.margen_pct == null ? null : Number(r.margen_pct),
      }))
    },
  })
}

// ── Serie diaria ventas / compras / margen ────────────────────────────────
export function useSerieDiaria(period: Period) {
  return useQuery({
    queryKey: ['manager', 'serieDiaria', periodKey(period)] as const,
    queryFn: async (): Promise<SerieDiariaPunto[]> => {
      const { data, error } = await supabase.rpc('manager_serie_diaria', {
        p_from: period.from,
        p_to: period.to,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        fecha:   String(r.fecha),
        ventas:  Number(r.ventas ?? 0),
        compras: Number(r.compras ?? 0),
        margen:  Number(r.margen ?? 0),
      }))
    },
  })
}

// ── Último sync ───────────────────────────────────────────────────────────
export function useUltimoSync() {
  return useQuery({
    queryKey: ['manager', 'sync', 'last'] as const,
    queryFn: async (): Promise<SyncLog | null> => {
      const { data, error } = await supabase
        .from('manager_holded_sync')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0] ?? null) as SyncLog | null
    },
    refetchInterval: 60_000,
  })
}

// ── Sync manual ────────────────────────────────────────────────────────────
export function useSyncManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (range: { start?: string; end?: string } | undefined) => {
      const { data, error } = await supabase.functions.invoke('holded-sync', {
        body: { ...range, trigger: 'manual' },
      })
      if (error) throw error
      return data as { ok: boolean; ventas: number; compras: number; lineas: number; errors: string[] }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager'] })
    },
  })
}
