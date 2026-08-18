import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

export type MetodoCobroTarde = 'tarjeta' | 'efectivo'

export interface PedidoTardeFactura {
  id: string
  manager_factura_id: string
  numero_factura: string
  cliente: string
  fecha: string
  subtotal: number
  importe_total: number
  coste: number
  beneficio: number
  metodo_cobro: MetodoCobroTarde
  cobrada_cliente: boolean
  cobrada_at: string | null
  liquidada_empresa: boolean
  liquidada_at: string | null
  created_at: string
  updated_at: string
}

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

export interface PedidosTardeKpis {
  generado: number
  beneficioRaul: number
  beneficioEmpresa: number
  pendienteRaulEmpresa: number
  pendienteEmpresaRaul: number
  balance: number
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
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
})

export function calcularPedidosTardeKpis(facturas: PedidoTardeFactura[]): PedidosTardeKpis {
  return facturas.reduce<PedidosTardeKpis>((acc, factura) => {
    const parteRaul = factura.beneficio * 0.8
    acc.generado += factura.importe_total
    acc.beneficioRaul += parteRaul
    acc.beneficioEmpresa += factura.beneficio * 0.2

    if (factura.cobrada_cliente && !factura.liquidada_empresa) {
      // Positivo: la empresa debe a Raúl. Negativo: Raúl debe a la empresa.
      const saldoEmpresaARaul = factura.metodo_cobro === 'tarjeta'
        ? parteRaul
        : parteRaul - factura.importe_total
      if (saldoEmpresaARaul >= 0) acc.pendienteEmpresaRaul += saldoEmpresaARaul
      else acc.pendienteRaulEmpresa += Math.abs(saldoEmpresaARaul)
    }

    acc.balance = acc.pendienteEmpresaRaul - acc.pendienteRaulEmpresa
    return acc
  }, {
    generado: 0,
    beneficioRaul: 0,
    beneficioEmpresa: 0,
    pendienteRaulEmpresa: 0,
    pendienteEmpresaRaul: 0,
    balance: 0,
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

export function usePedidosTardeFacturaIds() {
  return useQuery({
    queryKey: [...QUERY_KEY, 'factura-ids'] as const,
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

export function useEliminarPedidoTarde() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('trabajadores_pedidos_tarde_facturas')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
