import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Period } from './period'
import type {
  AbueloRow, AliasRow, ClienteFactura, ClienteListItem, ClienteProducto,
  CosteManualRow, FacturaLinea, FacturaListItem,
  ProductoCliente, ProductoCompra, ProductoListItem,
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
        ventas_subtotal:    Number(r.ventas_subtotal ?? 0),
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
        nombre:           String(r.nombre ?? '(sin nombre)'),
        product_id:       r.product_id == null ? null : String(r.product_id),
        unidades:         Number(r.unidades ?? 0),
        ventas:           Number(r.ventas ?? 0),
        ventas_subtotal:  Number(r.ventas_subtotal ?? 0),
        cogs:             Number(r.cogs ?? 0),
        margen:           Number(r.margen ?? 0),
        margen_pct:       r.margen_pct == null ? null : Number(r.margen_pct),
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

// ── Lista de clientes (agrupados por nombre canónico) ────────────────────
export function useClientesLista(period: Period) {
  return useQuery({
    queryKey: ['manager', 'clientes', periodKey(period)] as const,
    queryFn: async (): Promise<ClienteListItem[]> => {
      const { data, error } = await supabase.rpc('manager_clientes_lista', {
        p_from: period.from,
        p_to: period.to,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        contact_name_canon: String(r.contact_name_canon ?? '(sin contacto)'),
        contact_ids:        Array.isArray(r.contact_ids) ? r.contact_ids as string[] : null,
        docs:               Number(r.docs ?? 0),
        ventas:             Number(r.ventas ?? 0),
        ventas_subtotal:    Number(r.ventas_subtotal ?? 0),
        cogs:               Number(r.cogs ?? 0),
        margen:             Number(r.margen ?? 0),
        margen_pct:         r.margen_pct == null ? null : Number(r.margen_pct),
        pendiente_cobro:    Number(r.pendiente_cobro ?? 0),
        ultima_compra:      r.ultima_compra == null ? null : String(r.ultima_compra),
        num_aliases:        Number(r.num_aliases ?? 1),
      }))
    },
  })
}

// ── Facturas / albaranes de un cliente (por nombre canónico) ─────────────
export function useClienteFacturas(canonName: string | null, period: Period) {
  return useQuery({
    queryKey: ['manager', 'cliente', canonName, 'facturas', periodKey(period)] as const,
    enabled: !!canonName,
    queryFn: async (): Promise<ClienteFactura[]> => {
      if (!canonName) return []
      const { data, error } = await supabase.rpc('manager_cliente_facturas', {
        p_contact_name_canon: canonName, p_from: period.from, p_to: period.to,
      })
      if (error) throw error
      return (data ?? []) as ClienteFactura[]
    },
  })
}

// ── Productos favoritos de un cliente (por nombre canónico) ──────────────
export function useClienteProductos(canonName: string | null, period: Period) {
  return useQuery({
    queryKey: ['manager', 'cliente', canonName, 'productos', periodKey(period)] as const,
    enabled: !!canonName,
    queryFn: async (): Promise<ClienteProducto[]> => {
      if (!canonName) return []
      const { data, error } = await supabase.rpc('manager_cliente_productos', {
        p_contact_name_canon: canonName, p_from: period.from, p_to: period.to, p_limit: 30,
      })
      if (error) throw error
      return (data ?? []) as ClienteProducto[]
    },
  })
}

// ── Aliases de clientes (CRUD) ────────────────────────────────────────────
export function useAliases() {
  return useQuery({
    queryKey: ['manager', 'aliases'] as const,
    queryFn: async (): Promise<AliasRow[]> => {
      const { data, error } = await supabase
        .from('manager_clientes_alias')
        .select('id, alias_from, alias_to, created_at')
        .order('alias_to', { ascending: true })
      if (error) throw error
      return (data ?? []) as AliasRow[]
    },
  })
}

export function useAddAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { alias_from: string; alias_to: string }) => {
      const { error } = await supabase
        .from('manager_clientes_alias')
        .insert({ alias_from: input.alias_from.trim(), alias_to: input.alias_to.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager'] })
    },
  })
}

export function useDeleteAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('manager_clientes_alias').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager'] })
    },
  })
}

// ── Lista productos ───────────────────────────────────────────────────────
export function useProductosLista(period: Period) {
  return useQuery({
    queryKey: ['manager', 'productos', periodKey(period)] as const,
    queryFn: async (): Promise<ProductoListItem[]> => {
      const { data, error } = await supabase.rpc('manager_productos_lista', {
        p_from: period.from, p_to: period.to,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        product_id:      r.product_id == null ? null : String(r.product_id),
        nombre:          String(r.nombre ?? '(sin nombre)'),
        veces:           Number(r.veces ?? 0),
        unidades:        Number(r.unidades ?? 0),
        ventas:          Number(r.ventas ?? 0),
        ventas_subtotal: Number(r.ventas_subtotal ?? 0),
        cogs:            Number(r.cogs ?? 0),
        margen:          Number(r.margen ?? 0),
        margen_pct:      r.margen_pct == null ? null : Number(r.margen_pct),
        coste_unidad:    r.coste_unidad == null ? null : Number(r.coste_unidad),
        es_coste_manual: Boolean(r.es_coste_manual ?? false),
        ultima_compra:   r.ultima_compra == null ? null : String(r.ultima_compra),
        ultima_venta:    r.ultima_venta == null ? null : String(r.ultima_venta),
      }))
    },
  })
}

export function useProductoClientes(productId: string | null, period: Period) {
  return useQuery({
    queryKey: ['manager', 'producto', productId, 'clientes', periodKey(period)] as const,
    enabled: !!productId,
    queryFn: async (): Promise<ProductoCliente[]> => {
      if (!productId) return []
      const { data, error } = await supabase.rpc('manager_producto_clientes', {
        p_product_id: productId, p_from: period.from, p_to: period.to, p_limit: 30,
      })
      if (error) throw error
      return (data ?? []) as ProductoCliente[]
    },
  })
}

export function useProductoCompras(productId: string | null) {
  return useQuery({
    queryKey: ['manager', 'producto', productId, 'compras'] as const,
    enabled: !!productId,
    queryFn: async (): Promise<ProductoCompra[]> => {
      if (!productId) return []
      const { data, error } = await supabase.rpc('manager_producto_compras', {
        p_product_id: productId, p_limit: 60,
      })
      if (error) throw error
      return (data ?? []) as ProductoCompra[]
    },
  })
}

// ── Costes manuales (override) ────────────────────────────────────────────
export function useCosteManual(productId: string | null) {
  return useQuery({
    queryKey: ['manager', 'producto', productId, 'costeManual'] as const,
    enabled: !!productId,
    queryFn: async (): Promise<CosteManualRow | null> => {
      if (!productId) return null
      const { data, error } = await supabase
        .from('manager_costes_manuales')
        .select('product_id, coste_eur, nota, updated_at')
        .eq('product_id', productId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as CosteManualRow | null
    },
  })
}

export function useSetCosteManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { product_id: string; coste_eur: number; nota?: string | null }) => {
      const { error } = await supabase
        .from('manager_costes_manuales')
        .upsert({
          product_id: input.product_id,
          coste_eur:  input.coste_eur,
          nota:       input.nota ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'product_id' })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manager'] }) },
  })
}

export function useDeleteCosteManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('manager_costes_manuales')
        .delete()
        .eq('product_id', productId)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manager'] }) },
  })
}

// ── Facturas / Albaranes ──────────────────────────────────────────────────
export interface FacturaFiltros {
  tipo?: 'VENTA' | 'COMPRA' | null
  subtipo?: string | null
  q?: string | null
}

export function useFacturasLista(period: Period, f: FacturaFiltros) {
  return useQuery({
    queryKey: ['manager', 'facturas', periodKey(period), f.tipo ?? '', f.subtipo ?? '', f.q ?? ''] as const,
    queryFn: async (): Promise<FacturaListItem[]> => {
      const { data, error } = await supabase.rpc('manager_facturas_lista', {
        p_from: period.from, p_to: period.to,
        p_tipo: f.tipo ?? null, p_subtipo: f.subtipo ?? null, p_q: f.q ?? null, p_limit: 1000,
      })
      if (error) throw error
      return (data ?? []) as FacturaListItem[]
    },
  })
}

export function useFacturaDetalle(facturaId: string | null) {
  return useQuery({
    queryKey: ['manager', 'factura', facturaId, 'detalle'] as const,
    enabled: !!facturaId,
    queryFn: async (): Promise<FacturaLinea[]> => {
      if (!facturaId) return []
      const { data, error } = await supabase.rpc('manager_factura_detalle', { p_factura_id: facturaId })
      if (error) throw error
      return (data ?? []) as FacturaLinea[]
    },
  })
}

// ── Abuelo (frutería propia) ──────────────────────────────────────────────
export function useAbuelo(period: Period) {
  return useQuery({
    queryKey: ['manager', 'abuelo', periodKey(period)] as const,
    queryFn: async (): Promise<AbueloRow[]> => {
      const { data, error } = await supabase
        .from('manager_ventas_abuelo')
        .select('id, fecha, importe, nota, created_at')
        .gte('fecha', period.from).lte('fecha', period.to)
        .order('fecha', { ascending: false })
      if (error) throw error
      return (data ?? []) as AbueloRow[]
    },
  })
}

export function useAddAbuelo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { fecha: string; importe: number; nota?: string | null }) => {
      const { error } = await supabase
        .from('manager_ventas_abuelo')
        .insert({ fecha: input.fecha, importe: input.importe, nota: input.nota ?? null })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manager'] }) },
  })
}

export function useDeleteAbuelo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('manager_ventas_abuelo').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manager'] }) },
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
