import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Period } from './period'
import type {
  AbueloFactura, AbueloLinea, AliasRow, CatalogoProducto,
  ClienteFactura, ClienteListItem, ClienteProducto,
  CosteManualRow, FacturaLinea, FacturaListItem, Forecast,
  ProductoCliente, ProductoCompra, ProductoHistoricoMes, ProductoListItem,
  ResumenComparativo, ResumenPeriodo, SerieDiariaPunto, SyncLog,
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

// ── Resumen comparativo (vs periodo anterior equivalente) ────────────────
export function useResumenComparativo(period: Period) {
  return useQuery({
    queryKey: ['manager', 'resumenComp', periodKey(period)] as const,
    queryFn: async (): Promise<ResumenComparativo> => {
      const { data, error } = await supabase.rpc('manager_resumen_comparativo', {
        p_from: period.from, p_to: period.to,
      })
      if (error) throw error
      const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
      return {
        ventas:             Number(r?.ventas ?? 0),
        ventas_ant:         Number(r?.ventas_ant ?? 0),
        ventas_delta_pct:   r?.ventas_delta_pct == null ? null : Number(r.ventas_delta_pct),
        compras:            Number(r?.compras ?? 0),
        compras_ant:        Number(r?.compras_ant ?? 0),
        compras_delta_pct:  r?.compras_delta_pct == null ? null : Number(r.compras_delta_pct),
        margen:             Number(r?.margen ?? 0),
        margen_ant:         Number(r?.margen_ant ?? 0),
        margen_delta_pct:   r?.margen_delta_pct == null ? null : Number(r.margen_delta_pct),
        pendiente_cobro:    Number(r?.pendiente_cobro ?? 0),
        docs:               Number(r?.docs ?? 0),
        cogs:               Number(r?.cogs ?? 0),
        margen_pct:         r?.margen_pct == null ? null : Number(r.margen_pct),
        comp_from:          r?.comp_from == null ? null : String(r.comp_from),
        comp_to:            r?.comp_to == null ? null : String(r.comp_to),
      }
    },
  })
}

// ── Forecast próximo mes (con tendencia y proyección 3m) ─────────────────
export function useForecast() {
  return useQuery({
    queryKey: ['manager', 'forecast'] as const,
    queryFn: async (): Promise<Forecast> => {
      const { data, error } = await supabase.rpc('manager_forecast_proximo_mes')
      if (error) throw error
      const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
      const serie = (r?.meses_serie ?? []) as Array<{ mes: string; ventas: number; es_proy: boolean }>
      return {
        mes_proximo:     String(r?.mes_proximo ?? ''),
        forecast_next:   Number(r?.forecast_next ?? 0),
        mes_actual_proy: Number(r?.mes_actual_proy ?? 0),
        pct_mes:         Number(r?.pct_mes ?? 0),
        tendencia_pct:   Number(r?.tendencia_pct ?? 0),
        base_meses:      Number(r?.base_meses ?? 0),
        meses_serie:     serie.map(s => ({ mes: String(s.mes), ventas: Number(s.ventas), es_proy: Boolean(s.es_proy) })),
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
      return (data ?? []).map((r: Record<string, unknown>) => ({
        nombre:          String(r.nombre ?? '(sin nombre)'),
        product_id:      r.product_id == null ? null : String(r.product_id),
        veces:           Number(r.veces ?? 0),
        unidades:        Number(r.unidades ?? 0),
        ventas_subtotal: Number(r.ventas_subtotal ?? 0),
        cogs:            Number(r.cogs ?? 0),
        margen:          Number(r.margen ?? 0),
        margen_pct:      r.margen_pct == null ? null : Number(r.margen_pct),
        ultima_compra:   r.ultima_compra == null ? null : String(r.ultima_compra),
      }))
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

// Preview: cuántas facturas se unificarían si añadiéramos este alias
export function useAliasPreview(name: string) {
  const trimmed = name.trim()
  return useQuery({
    queryKey: ['manager', 'aliasPreview', trimmed] as const,
    enabled: trimmed.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_facturas')
        .select('id, total')
        .eq('contact_name', trimmed)
      if (error) throw error
      const docs = data?.length ?? 0
      const total = (data ?? []).reduce((s, r: { total: number | null }) => s + Number(r.total ?? 0), 0)
      return { docs, total }
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
      return (data ?? []).map((r: Record<string, unknown>) => ({
        contact_name_canon: String(r.contact_name_canon ?? '(sin contacto)'),
        veces:              Number(r.veces ?? 0),
        unidades:           Number(r.unidades ?? 0),
        ventas_subtotal:    Number(r.ventas_subtotal ?? 0),
        margen:             Number(r.margen ?? 0),
        margen_pct:         r.margen_pct == null ? null : Number(r.margen_pct),
        ultima_compra:      r.ultima_compra == null ? null : String(r.ultima_compra),
      }))
    },
  })
}

export function useProductoHistorico(productId: string | null, meses = 12) {
  return useQuery({
    queryKey: ['manager', 'producto', productId, 'historico', meses] as const,
    enabled: !!productId,
    queryFn: async (): Promise<ProductoHistoricoMes[]> => {
      if (!productId) return []
      const { data, error } = await supabase.rpc('manager_producto_historico', {
        p_product_id: productId, p_meses: meses,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        mes:                  String(r.mes ?? ''),
        unidades_vendidas:    Number(r.unidades_vendidas ?? 0),
        ventas:               Number(r.ventas ?? 0),
        precio_venta_medio:   r.precio_venta_medio == null ? null : Number(r.precio_venta_medio),
        unidades_compradas:   Number(r.unidades_compradas ?? 0),
        compras:              Number(r.compras ?? 0),
        precio_compra_medio:  r.precio_compra_medio == null ? null : Number(r.precio_compra_medio),
      }))
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
  page?: number   // 1-based
  pageSize?: number
}

export function useFacturasLista(period: Period, f: FacturaFiltros) {
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 100
  return useQuery({
    queryKey: ['manager', 'facturas', periodKey(period), f.tipo ?? '', f.subtipo ?? '', f.q ?? '', page, pageSize] as const,
    queryFn: async (): Promise<FacturaListItem[]> => {
      const { data, error } = await supabase.rpc('manager_facturas_lista', {
        p_from: period.from, p_to: period.to,
        p_tipo: f.tipo ?? null, p_subtipo: f.subtipo ?? null, p_q: f.q ?? null,
        p_limit: pageSize, p_offset: (page - 1) * pageSize,
      })
      if (error) throw error
      const num = (v: unknown): number | null => v == null ? null : Number(v)
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id:                 String(r.id),
        tipo:               r.tipo as 'VENTA' | 'COMPRA',
        subtipo:            r.subtipo == null ? null : String(r.subtipo),
        doc_number:         r.doc_number == null ? null : String(r.doc_number),
        contact_id:         r.contact_id == null ? null : String(r.contact_id),
        contact_name_raw:   r.contact_name_raw == null ? null : String(r.contact_name_raw),
        contact_name_canon: r.contact_name_canon == null ? null : String(r.contact_name_canon),
        fecha:              r.fecha == null ? null : String(r.fecha),
        fecha_vencimiento:  r.fecha_vencimiento == null ? null : String(r.fecha_vencimiento),
        subtotal:           num(r.subtotal),
        total:              num(r.total),
        cogs:               num(r.cogs),
        margen:             num(r.margen),
        margen_pct:         num(r.margen_pct),
        payments_pending:   num(r.payments_pending),
        status:             r.status == null ? null : Number(r.status),
        total_count:        Number(r.total_count ?? 0),
      }))
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

// ── Abuelo (frutería propia) — facturas con líneas ───────────────────────
export function useAbueloFacturas(period: Period) {
  return useQuery({
    queryKey: ['manager', 'abuelo', periodKey(period)] as const,
    queryFn: async (): Promise<AbueloFactura[]> => {
      const { data, error } = await supabase
        .from('manager_abuelo_facturas')
        .select('id, fecha, numero_factura, nota, total, num_lineas, created_at')
        .gte('fecha', period.from).lte('fecha', period.to)
        .order('fecha', { ascending: false })
      if (error) throw error
      return (data ?? []) as AbueloFactura[]
    },
  })
}

export function useAbueloLineas(facturaId: string | null) {
  return useQuery({
    queryKey: ['manager', 'abuelo', 'lineas', facturaId] as const,
    enabled: !!facturaId,
    queryFn: async (): Promise<AbueloLinea[]> => {
      if (!facturaId) return []
      const { data, error } = await supabase
        .from('manager_lineas_abuelo')
        .select('id, factura_id, product_id, nombre, units, price, subtotal')
        .eq('factura_id', facturaId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as AbueloLinea[]
    },
  })
}

interface AbueloLineaInput {
  product_id?: string | null
  nombre: string
  units: number
  price: number
}

export function useAddAbueloFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      fecha: string
      numero_factura?: string | null
      nota?: string | null
      lineas: AbueloLineaInput[]
    }) => {
      const total = input.lineas.reduce((s, l) => s + l.units * l.price, 0)
      const subtotal = total / 1.04  // asumimos IVA 4% para guardar el desglose
      // Cabecera
      const { data: cab, error: errCab } = await supabase
        .from('manager_ventas_abuelo')
        .insert({
          fecha:          input.fecha,
          numero_factura: input.numero_factura ?? null,
          nota:           input.nota ?? null,
          importe:        total,           // legacy column
          subtotal,
          total,
        })
        .select('id')
        .single()
      if (errCab) throw errCab
      const facturaId = cab?.id as string
      if (!facturaId) throw new Error('Sin id de factura')
      // Líneas
      if (input.lineas.length > 0) {
        const rows = input.lineas.map(l => ({
          factura_id: facturaId,
          product_id: l.product_id ?? null,
          nombre:     l.nombre,
          units:      l.units,
          price:      l.price,
        }))
        const { error: errLin } = await supabase.from('manager_lineas_abuelo').insert(rows)
        if (errLin) {
          // Rollback manual de la cabecera si las líneas fallan
          await supabase.from('manager_ventas_abuelo').delete().eq('id', facturaId)
          throw errLin
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manager'] }) },
  })
}

export function useDeleteAbueloFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // CASCADE en manager_lineas_abuelo borra las líneas
      const { error } = await supabase.from('manager_ventas_abuelo').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manager'] }) },
  })
}

// Catálogo de productos para autocomplete
export function useCatalogoProductos(q: string) {
  return useQuery({
    queryKey: ['manager', 'catalogo', q] as const,
    queryFn: async (): Promise<CatalogoProducto[]> => {
      const { data, error } = await supabase.rpc('manager_catalogo_productos', { p_q: q || null, p_limit: 30 })
      if (error) throw error
      return (data ?? []) as CatalogoProducto[]
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
