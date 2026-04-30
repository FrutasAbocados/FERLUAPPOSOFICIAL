import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type {
  ClientePedido,
  EstadoPedido,
  LineaParseada,
  Pedido,
} from './types'

const KEYS = {
  clientes:        ['pedidos_wa', 'clientes'] as const,
  pedidosDelDia:   (fecha: string) => ['pedidos_wa', 'pedidos', fecha] as const,
  pedido:          (id: string) => ['pedidos_wa', 'pedido', id] as const,
}

export function useClientesPedidosWa() {
  return useQuery({
    queryKey: KEYS.clientes,
    queryFn: async (): Promise<ClientePedido[]> => {
      const { data, error } = await supabase
        .from('pedidos_wa_clientes')
        .select('*')
        .eq('activo', true)
        .order('repartidor', { ascending: true })
        .order('horario',    { ascending: true })
      if (error) throw error
      return (data ?? []) as ClientePedido[]
    },
  })
}

export function usePedidosDelDia(fecha: string) {
  return useQuery({
    queryKey: KEYS.pedidosDelDia(fecha),
    queryFn: async (): Promise<Pedido[]> => {
      const { data, error } = await supabase
        .from('pedidos_wa')
        .select(`
          *,
          cliente:cliente_id (
            id, nombre, nombre_normalizado, holded_contact_id,
            repartidor, horario, tipo_factura, salida,
            subseccion_default, notas, activo
          ),
          lineas:pedidos_wa_lineas (
            id, pedido_id, orden, cantidad, unidad,
            producto_normalizado, producto_raw,
            subseccion, notas, es_gratis, metodo, created_at
          )
        `)
        .eq('fecha', fecha)
        .order('created_at', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as Pedido[]
      for (const p of rows) {
        if (p.lineas) p.lineas.sort((a, b) => a.orden - b.orden)
      }
      return rows
    },
  })
}

type CrearPedidoInput = {
  cliente_id: string
  fecha: string
  texto_original: string
  notas_admin: string | null
  faltas: string | null
  estado?: EstadoPedido
  lineas: LineaParseada[]
}

export function useCrearPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CrearPedidoInput): Promise<{ pedido_id: string }> => {
      const { data: pedRow, error: pedErr } = await supabase
        .from('pedidos_wa')
        .insert({
          cliente_id:     input.cliente_id,
          fecha:          input.fecha,
          texto_original: input.texto_original,
          notas_admin:    input.notas_admin,
          faltas:         input.faltas,
          estado:         input.estado ?? 'pendiente',
        })
        .select('id')
        .single()
      if (pedErr || !pedRow) throw pedErr ?? new Error('No se pudo crear el pedido')

      if (input.lineas.length > 0) {
        const rows = input.lineas.map(l => ({
          pedido_id:            pedRow.id,
          orden:                l.orden,
          cantidad:             l.cantidad,
          unidad:               l.unidad,
          producto_normalizado: l.producto,
          producto_raw:         l.productoRaw,
          subseccion:           l.subseccion,
          notas:                l.notas,
          es_gratis:            l.esGratis,
          metodo:               l.metodo,
        }))
        const { error: linErr } = await supabase
          .from('pedidos_wa_lineas')
          .insert(rows)
        if (linErr) throw linErr
      }

      return { pedido_id: pedRow.id as string }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(vars.fecha) })
    },
  })
}

type ActualizarPedidoInput = {
  id: string
  fecha: string
  patch: Partial<{
    notas_admin: string | null
    faltas: string | null
    estado: EstadoPedido
  }>
}

export function useActualizarPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ActualizarPedidoInput) => {
      const { error } = await supabase
        .from('pedidos_wa')
        .update(input.patch)
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(vars.fecha) })
    },
  })
}

export function useEliminarPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; fecha: string }) => {
      const { error } = await supabase.from('pedidos_wa').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(vars.fecha) })
    },
  })
}
