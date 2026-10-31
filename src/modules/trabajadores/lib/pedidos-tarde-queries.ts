import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

import {
  type MetodoCobroTarde,
  type PedidoTardeFactura,
} from './pedidos-tarde-calc'

export * from './pedidos-tarde-calc'

export interface FacturaHoldedTarde {
  id: string
  doc_number: string
  contact_name: string
  fecha: string
  subtotal: number
  total: number
}

export interface MargenFacturaTarde {
  subtotalLineas: number
  coste: number
  beneficio: number
}

const QUERY_KEY = ['trabajadores', 'pedidos-tarde'] as const

const asNumber = (value: unknown): number => Number(value ?? 0)

const mapPedidoTarde = (row: Record<string, unknown>): PedidoTardeFactura => ({
  id: String(row.id),
  manager_factura_id: String(row.manager_factura_id),
  numero_factura: String(row.numero_factura),
  cliente: String(row.cliente),
  fecha: String(row.fecha),
  subtotal: asNumber(row.subtotal),
  importe_total: asNumber(row.importe_total),
  coste: asNumber(row.coste),
  beneficio: asNumber(row.beneficio),
  metodo_cobro: row.metodo_cobro as MetodoCobroTarde,
  cobrada_cliente: Boolean(row.cobrada_cliente),
  cobrada_at: row.cobrada_at == null ? null : String(row.cobrada_at),
  liquidada_empresa: Boolean(row.liquidada_empresa),
  liquidada_at: row.liquidada_at == null ? null : String(row.liquidada_at),
  created_by: String(row.created_by),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
  pct_repartidor: asNumber(row.pct_repartidor ?? 80),
  pct_luis: asNumber(row.pct_luis),
  pct_alvaro: asNumber(row.pct_alvaro),
  pct_impuesto: asNumber(row.pct_impuesto),
  pct_empresa: asNumber(row.pct_empresa ?? 20),
})

/** Nombre del repartidor por user_id (solo lo usa administración). */
export function useRepartidoresPedidosTarde(userIds: string[], enabled: boolean) {
  const ids = [...new Set(userIds)].sort()
  return useQuery({
    queryKey: [...QUERY_KEY, 'repartidores', ids] as const,
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from('empleados')
        .select('user_id, nombre')
        .in('user_id', ids)
      if (error) throw error
      return new Map((data ?? []).map((row) => [String(row.user_id), String(row.nombre)]))
    },
  })
}

export function usePedidosTardeFacturas(from: string, toExclusive: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, from, toExclusive] as const,
    queryFn: async (): Promise<PedidoTardeFactura[]> => {
      const { data, error } = await supabase
        .from('trabajadores_pedidos_tarde_facturas')
        .select('*')
        .gte('fecha', from)
        .lt('fecha', toExclusive)
        .order('fecha', { ascending: false })
        .order('numero_factura', { ascending: false })
      if (error) throw error
      return (data ?? []).map((row) => mapPedidoTarde(row as Record<string, unknown>))
    },
  })
}

export function usePedidosTardeFacturaIds(enabled = true) {
  return useQuery({
    queryKey: [...QUERY_KEY, 'factura-ids'] as const,
    enabled,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('trabajadores_pedidos_tarde_facturas')
        .select('manager_factura_id')
      if (error) throw error
      return new Set((data ?? []).map((row) => String(row.manager_factura_id)))
    },
  })
}

export function useBuscarFacturasHoldedTarde(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: [...QUERY_KEY, 'buscar-holded', q] as const,
    enabled: q.length >= 2,
    staleTime: 60_000,
    queryFn: async (): Promise<FacturaHoldedTarde[]> => {
      const { data, error } = await supabase
        .from('manager_facturas')
        .select('id, doc_number, contact_name, fecha, subtotal, total')
        .eq('tipo', 'VENTA')
        .not('doc_number', 'is', null)
        .ilike('doc_number', `%${q}%`)
        .order('fecha', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: String(row.id),
        doc_number: String(row.doc_number),
        contact_name: String(row.contact_name ?? '(sin cliente)'),
        fecha: String(row.fecha),
        subtotal: asNumber(row.subtotal),
        total: asNumber(row.total),
      }))
    },
  })
}

export function useMargenFacturaTarde(facturaId: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, 'margen-holded', facturaId] as const,
    enabled: !!facturaId,
    queryFn: async (): Promise<MargenFacturaTarde> => {
      const { data, error } = await supabase.rpc('manager_factura_detalle', {
        p_factura_id: facturaId,
      })
      if (error) throw error
      const rows = (data ?? []) as Array<Record<string, unknown>>
      return rows.reduce<MargenFacturaTarde>((acc, row) => ({
        subtotalLineas: acc.subtotalLineas + asNumber(row.subtotal),
        coste: acc.coste + asNumber(row.cogs_linea),
        beneficio: acc.beneficio + asNumber(row.margen_linea),
      }), { subtotalLineas: 0, coste: 0, beneficio: 0 })
    },
  })
}

export function useCrearPedidoTarde() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      factura: FacturaHoldedTarde
      margen: MargenFacturaTarde
      metodoCobro: MetodoCobroTarde
    }) => {
      const { error } = await supabase
        .from('trabajadores_pedidos_tarde_facturas')
        .insert({
          manager_factura_id: input.factura.id,
          numero_factura: input.factura.doc_number,
          cliente: input.factura.contact_name,
          fecha: input.factura.fecha,
          subtotal: input.factura.subtotal,
          importe_total: input.factura.total,
          coste: input.margen.coste,
          beneficio: input.margen.beneficio,
          metodo_cobro: input.metodoCobro,
        })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useActualizarEstadoPedidosTarde() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      ids: string[]
      campo: 'cobrada' | 'liquidada'
      valor: boolean
    }) => {
      if (input.ids.length === 0) return
      const now = new Date().toISOString()
      const cambios = input.campo === 'cobrada'
        ? input.valor
          ? { cobrada_cliente: true, cobrada_at: now }
          : { cobrada_cliente: false, cobrada_at: null, liquidada_empresa: false, liquidada_at: null }
        : input.valor
          ? { liquidada_empresa: true, liquidada_at: now }
          : { liquidada_empresa: false, liquidada_at: null }
      const { error } = await supabase
        .from('trabajadores_pedidos_tarde_facturas')
        .update(cambios)
        .in('id', input.ids)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useCambiarMetodoPedidoTarde() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; metodoCobro: MetodoCobroTarde }) => {
      const { error } = await supabase
        .from('trabajadores_pedidos_tarde_facturas')
        .update({ metodo_cobro: input.metodoCobro })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
