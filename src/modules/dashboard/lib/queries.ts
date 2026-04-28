import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

export interface KpisHoy {
  ventas_hoy: number
  compras_hoy: number
  docs_hoy: number
  pendiente_mes: number
  ultimo_sync_at: string | null
  ultimo_sync_ok: boolean | null
  minutos_desde_sync: number | null
}

export interface PendienteMismatch {
  cliente_nombre: string
  pendiente_cobros: number
  pendiente_manager_mes: number
  diferencia: number
  match_status: 'match' | 'mismatch' | 'no_en_manager'
}

export interface ProductoAnomalo {
  product_id: string | null
  nombre: string
  unidades: number
  ventas: number
  margen: number
  margen_pct: number | null
  motivo: 'sin_coste' | 'margen_bajo' | 'margen_excesivo'
}

export interface ClienteInactivo {
  contact_name_canon: string
  ultima_compra: string
  dias_sin_pedir: number
  cadencia_dias: number
  pedidos_90d: number
  ventas_90d: number
}

export interface CosteSubiendo {
  product_id: string
  nombre: string
  coste_actual: number
  coste_anterior: number
  variacion_pct: number
  ultima_compra: string
}

const num = (v: unknown): number => v == null ? 0 : Number(v)
const numN = (v: unknown): number | null => v == null ? null : Number(v)

export function useKpisHoy() {
  return useQuery({
    queryKey: ['dashboard', 'kpisHoy'] as const,
    refetchInterval: 60_000,
    queryFn: async (): Promise<KpisHoy> => {
      const { data, error } = await supabase.rpc('dashboard_kpis_hoy')
      if (error) throw error
      const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
      return {
        ventas_hoy:         num(r?.ventas_hoy),
        compras_hoy:        num(r?.compras_hoy),
        docs_hoy:           num(r?.docs_hoy),
        pendiente_mes:      num(r?.pendiente_mes),
        ultimo_sync_at:     r?.ultimo_sync_at == null ? null : String(r.ultimo_sync_at),
        ultimo_sync_ok:     r?.ultimo_sync_ok == null ? null : Boolean(r.ultimo_sync_ok),
        minutos_desde_sync: r?.minutos_desde_sync == null ? null : Number(r.minutos_desde_sync),
      }
    },
  })
}

export function usePendienteMismatch() {
  return useQuery({
    queryKey: ['dashboard', 'pendienteMismatch'] as const,
    queryFn: async (): Promise<PendienteMismatch[]> => {
      const { data, error } = await supabase.rpc('dashboard_pendiente_mismatch')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        cliente_nombre:        String(r.cliente_nombre ?? ''),
        pendiente_cobros:      num(r.pendiente_cobros),
        pendiente_manager_mes: num(r.pendiente_manager_mes),
        diferencia:            num(r.diferencia),
        match_status:          (r.match_status as PendienteMismatch['match_status']) ?? 'no_en_manager',
      }))
    },
  })
}

export function useProductosAnomalos(dias = 30) {
  return useQuery({
    queryKey: ['dashboard', 'productosAnomalos', dias] as const,
    queryFn: async (): Promise<ProductoAnomalo[]> => {
      const { data, error } = await supabase.rpc('dashboard_productos_anomalos', { p_dias: dias })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        product_id: r.product_id == null ? null : String(r.product_id),
        nombre:     String(r.nombre ?? '(sin nombre)'),
        unidades:   num(r.unidades),
        ventas:     num(r.ventas),
        margen:     num(r.margen),
        margen_pct: numN(r.margen_pct),
        motivo:     (r.motivo as ProductoAnomalo['motivo']),
      }))
    },
  })
}

export function useClientesInactivos() {
  return useQuery({
    queryKey: ['dashboard', 'clientesInactivos'] as const,
    queryFn: async (): Promise<ClienteInactivo[]> => {
      const { data, error } = await supabase.rpc('dashboard_clientes_inactivos')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        contact_name_canon: String(r.contact_name_canon ?? ''),
        ultima_compra:      String(r.ultima_compra ?? ''),
        dias_sin_pedir:     num(r.dias_sin_pedir),
        cadencia_dias:      num(r.cadencia_dias),
        pedidos_90d:        num(r.pedidos_90d),
        ventas_90d:         num(r.ventas_90d),
      }))
    },
  })
}

export function useCostesSubiendo(dias = 14, pctMin = 15) {
  return useQuery({
    queryKey: ['dashboard', 'costesSubiendo', dias, pctMin] as const,
    queryFn: async (): Promise<CosteSubiendo[]> => {
      const { data, error } = await supabase.rpc('dashboard_costes_subiendo', { p_dias: dias, p_pct_min: pctMin })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        product_id:     String(r.product_id ?? ''),
        nombre:         String(r.nombre ?? ''),
        coste_actual:   num(r.coste_actual),
        coste_anterior: num(r.coste_anterior),
        variacion_pct:  num(r.variacion_pct),
        ultima_compra:  String(r.ultima_compra ?? ''),
      }))
    },
  })
}
