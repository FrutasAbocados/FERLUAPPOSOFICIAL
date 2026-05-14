import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export interface KpiPunto {
  fecha: string       // ISO YYYY-MM-DD
  ventas: number
  compras: number
  docs: number
  pendiente: number
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

export interface ClienteProgramaPendiente {
  contact_name_canon: string
  programa_manual: 'vip' | 'riesgo' | 'deuda' | 'potencial' | 'rentable' | 'estandar' | null
  estado: 'activo' | 'seguimiento' | 'pausado' | 'cerrado'
  prioridad: 'baja' | 'media' | 'alta'
  proxima_accion: string | null
  proxima_accion_fecha: string | null
  ultimo_contacto_at: string | null
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

export function useKpisSerie(dias = 7) {
  return useQuery({
    queryKey: ['dashboard', 'kpisSerie', dias] as const,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<KpiPunto[]> => {
      const { data, error } = await supabase.rpc('dashboard_kpis_serie', { dias })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        fecha:     String(r.fecha ?? ''),
        ventas:    num(r.ventas),
        compras:   num(r.compras),
        docs:      num(r.docs),
        pendiente: num(r.pendiente),
      }))
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
      const { data, error } = await supabase.rpc('dashboard_top_deudores')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        cliente_id:  String(r.cliente_id ?? ''),
        nombre:      String(r.nombre ?? '(sin nombre)'),
        pendiente:   num(r.pendiente),
        movimientos: num(r.movimientos),
        vencido:     num(r.vencido),
      }))
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

export function useClientesProgramaPendientes(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['dashboard', 'clientesProgramaPendientes'] as const,
    enabled: opts.enabled ?? true,
    queryFn: async (): Promise<ClienteProgramaPendiente[]> => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('clientes_programa')
        .select('contact_name_canon, programa_manual, estado, prioridad, proxima_accion, proxima_accion_fecha, ultimo_contacto_at')
        .neq('estado', 'cerrado')
        .order('proxima_accion_fecha', { ascending: true, nullsFirst: false })
        .order('prioridad', { ascending: false })
      if (error) throw error
      return ((data ?? []) as ClienteProgramaPendiente[]).filter((row) => {
        if (row.estado === 'pausado') return false
        if (row.proxima_accion_fecha && row.proxima_accion_fecha <= today) return true
        return row.programa_manual === 'riesgo' || row.programa_manual === 'deuda'
      })
    },
    staleTime: 60_000,
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


// ─── Briefing diario IA ────────────────────────────────────────

export interface BriefingDia {
  id: string
  fecha: string
  contenido_md: string
  resumen_corto: string | null
  modelo: string | null
  fuente: string
  generated_at: string
}

const BRIEFING_KEY = ['dashboard', 'briefing-hoy'] as const

export function useBriefingHoy() {
  return useQuery({
    queryKey: BRIEFING_KEY,
    queryFn: async (): Promise<BriefingDia | null> => {
      const { data, error } = await supabase.rpc('dashboard_briefing_get')
      if (error) throw error
      const row = (data ?? [])[0] as Record<string, unknown> | undefined
      if (!row) return null
      return {
        id: String(row.id ?? ''),
        fecha: String(row.fecha ?? ''),
        contenido_md: String(row.contenido_md ?? ''),
        resumen_corto: row.resumen_corto == null ? null : String(row.resumen_corto),
        modelo: row.modelo == null ? null : String(row.modelo),
        fuente: String(row.fuente ?? ''),
        generated_at: String(row.generated_at ?? ''),
      }
    },
    staleTime: 5 * 60_000,
  })
}

export function useGenerarBriefingAhora() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('dashboard-briefing-diario', {
        body: {},
      })
      if (error) throw error
      return data as { ok: boolean; contenido_md?: string; error?: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BRIEFING_KEY })
    },
  })
}

// ─── PVP sugerido (margen objetivo) ────────────────────────────

export interface PvpSugerido {
  product_id: string
  nombre: string
  coste_actual: number
  coste_anterior: number
  coste_variacion_pct: number
  pvp_actual: number | null
  pvp_sugerido: number
  margen_actual_pct: number | null
  delta_pvp_pct: number | null
  ultimas_ventas_dias: number
  ultima_compra: string
}

export function usePvpSugerido(margenObjetivoPct = 25, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['dashboard', 'pvpSugerido', margenObjetivoPct] as const,
    enabled: opts.enabled ?? true,
    queryFn: async (): Promise<PvpSugerido[]> => {
      const { data, error } = await supabase.rpc('dashboard_pvp_sugerido', {
        p_dias: 14, p_pct_min: 15, p_margen_objetivo_pct: margenObjetivoPct,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        product_id:          String(r.product_id ?? ''),
        nombre:              String(r.nombre ?? ''),
        coste_actual:        num(r.coste_actual),
        coste_anterior:      num(r.coste_anterior),
        coste_variacion_pct: num(r.coste_variacion_pct),
        pvp_actual:          numN(r.pvp_actual),
        pvp_sugerido:        num(r.pvp_sugerido),
        margen_actual_pct:   numN(r.margen_actual_pct),
        delta_pvp_pct:       numN(r.delta_pvp_pct),
        ultimas_ventas_dias: Number(r.ultimas_ventas_dias ?? 0),
        ultima_compra:       String(r.ultima_compra ?? ''),
      }))
    },
  })
}
