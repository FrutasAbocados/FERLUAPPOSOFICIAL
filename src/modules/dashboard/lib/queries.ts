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

export type RiesgoFugaMotivo = 'inactivo' | 'ralentiza' | 'ticket_cae'

export interface ClienteRiesgoFuga {
  contact_name_canon: string
  motivos: RiesgoFugaMotivo[]
  severidad: 'critica' | 'aviso'
  ultima_compra: string
  dias_sin_pedir: number
  cadencia_dias: number
  pedidos_90d: number
  ventas_90d: number
  ticket_medio_30d: number | null
  ticket_medio_30_90: number | null
  valor_perdido_estimado: number
}

export interface CosteSubiendo {
  product_id: string
  nombre: string
  coste_actual: number
  coste_anterior: number
  variacion_pct: number
  ultima_compra: string
}

export interface DeudorCobros {
  cliente_id: string
  nombre: string
  pendiente: number
  movimientos: number
  vencido: number       // importe ya vencido
}

export interface PedidoEsperado {
  contact_name_canon: string
  ultima_compra: string
  cadencia_dias: number
  proxima_esperada: string
  dias_para: number
  ventas_medias: number
  prioridad: 'urgente' | 'pronto' | 'esta_semana'
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

export function useProductosAnomalos(dias = 30, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['dashboard', 'productosAnomalos', dias] as const,
    enabled: opts.enabled ?? true,
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

export function useClientesRiesgoFuga(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['dashboard', 'clientesRiesgoFuga'] as const,
    enabled: opts.enabled ?? true,
    queryFn: async (): Promise<ClienteRiesgoFuga[]> => {
      const { data, error } = await supabase.rpc('dashboard_clientes_riesgo_fuga')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        contact_name_canon:     String(r.contact_name_canon ?? ''),
        motivos:                Array.isArray(r.motivos) ? (r.motivos as RiesgoFugaMotivo[]) : [],
        severidad:              (r.severidad as ClienteRiesgoFuga['severidad']) ?? 'aviso',
        ultima_compra:          String(r.ultima_compra ?? ''),
        dias_sin_pedir:         num(r.dias_sin_pedir),
        cadencia_dias:          num(r.cadencia_dias),
        pedidos_90d:            num(r.pedidos_90d),
        ventas_90d:             num(r.ventas_90d),
        ticket_medio_30d:       numN(r.ticket_medio_30d),
        ticket_medio_30_90:     numN(r.ticket_medio_30_90),
        valor_perdido_estimado: num(r.valor_perdido_estimado),
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

export function useTopDeudoresCobros(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['dashboard', 'topDeudores'] as const,
    enabled: opts.enabled ?? true,
    queryFn: async (): Promise<DeudorCobros[]> => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('cobros_movimientos')
        .select('cliente_id, importe, importe_cobrado, fecha_vencimiento, cobros_clientes!inner(nombre, activo)')
        .eq('pagado', false)
        .eq('cobros_clientes.activo', true)
      if (error) throw error
      // Agregar por cliente
      const map = new Map<string, DeudorCobros>()
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const cliente_id = String(row.cliente_id ?? '')
        const nombre = (row.cobros_clientes as { nombre?: string })?.nombre ?? '(sin nombre)'
        const importe = Number(row.importe ?? 0)
        const cobrado = Number(row.importe_cobrado ?? 0)
        const pend = importe - cobrado
        const vencido = (row.fecha_vencimiento && String(row.fecha_vencimiento) < today) ? pend : 0
        const cur = map.get(cliente_id) ?? { cliente_id, nombre, pendiente: 0, movimientos: 0, vencido: 0 }
        cur.pendiente += pend
        cur.movimientos += 1
        cur.vencido += vencido
        map.set(cliente_id, cur)
      }
      return Array.from(map.values())
        .filter(d => d.pendiente > 0)
        .sort((a, b) => b.pendiente - a.pendiente)
    },
  })
}

export function usePedidosEsperados(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['dashboard', 'pedidosEsperados'] as const,
    enabled: opts.enabled ?? true,
    queryFn: async (): Promise<PedidoEsperado[]> => {
      const { data, error } = await supabase.rpc('manager_pedidos_proximos')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        contact_name_canon: String(r.contact_name_canon ?? ''),
        ultima_compra:      String(r.ultima_compra ?? ''),
        cadencia_dias:      Number(r.cadencia_dias ?? 0),
        proxima_esperada:   String(r.proxima_esperada ?? ''),
        dias_para:          Number(r.dias_para ?? 0),
        ventas_medias:      Number(r.ventas_medias ?? 0),
        prioridad:          (r.prioridad as PedidoEsperado['prioridad']) ?? 'esta_semana',
      }))
    },
  })
}

export function useCostesSubiendo(dias = 14, pctMin = 15, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['dashboard', 'costesSubiendo', dias, pctMin] as const,
    enabled: opts.enabled ?? true,
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
