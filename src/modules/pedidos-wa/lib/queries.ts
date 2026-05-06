import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type {
  ClientePedido,
  EstadoPedido,
  LineaParseada,
  Pedido,
  Repartidor,
  Salida,
  TipoFactura,
} from './types'

const KEYS = {
  clientes:        ['pedidos_wa', 'clientes'] as const,
  clientesAll:     ['pedidos_wa', 'clientes', 'all'] as const,
  pedidosDelDia:   (fecha: string) => ['pedidos_wa', 'pedidos', fecha] as const,
  pedido:          (id: string) => ['pedidos_wa', 'pedido', id] as const,
  inventario:      (fecha: string) => ['pedidos_wa', 'inventario', fecha] as const,
  cotejo:          (fecha: string) => ['pedidos_wa', 'cotejo', fecha] as const,
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

export function useTodosLosClientesPedidos() {
  return useQuery({
    queryKey: KEYS.clientesAll,
    queryFn: async (): Promise<ClientePedido[]> => {
      const { data, error } = await supabase
        .from('pedidos_wa_clientes')
        .select('*')
        .order('activo', { ascending: false })
        .order('repartidor', { ascending: true })
        .order('horario',    { ascending: true })
      if (error) throw error
      return (data ?? []) as ClientePedido[]
    },
  })
}

export type ClienteInput = {
  nombre: string
  repartidor: Repartidor
  horario: string | null
  tipo_factura: TipoFactura
  salida: Salida
  subseccion_default: string | null
  notas: string | null
  holded_contact_id: string | null
  activo: boolean
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function useCrearClientePedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ClienteInput): Promise<ClientePedido> => {
      const row = {
        ...input,
        nombre: input.nombre.trim(),
        nombre_normalizado: normalizar(input.nombre),
      }
      const { data, error } = await supabase
        .from('pedidos_wa_clientes')
        .insert(row)
        .select('*')
        .single()
      if (error || !data) throw error ?? new Error('No se pudo crear cliente')
      return data as ClientePedido
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.clientes })
      qc.invalidateQueries({ queryKey: KEYS.clientesAll })
    },
  })
}

export function useActualizarClientePedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<ClienteInput> }): Promise<ClientePedido> => {
      const patch = { ...input.patch } as Record<string, unknown>
      if (typeof input.patch.nombre === 'string') {
        patch.nombre = input.patch.nombre.trim()
        patch.nombre_normalizado = normalizar(input.patch.nombre)
      }
      const { data, error } = await supabase
        .from('pedidos_wa_clientes')
        .update(patch)
        .eq('id', input.id)
        .select('*')
        .single()
      if (error || !data) throw error ?? new Error('No se pudo actualizar cliente')
      return data as ClientePedido
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.clientes })
      qc.invalidateQueries({ queryKey: KEYS.clientesAll })
    },
  })
}

export function useToggleActivoCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; activo: boolean }) => {
      const { error } = await supabase
        .from('pedidos_wa_clientes')
        .update({ activo: input.activo })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.clientes })
      qc.invalidateQueries({ queryKey: KEYS.clientesAll })
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
          id, cliente_id, fecha, texto_original, notas_admin, faltas, estado,
          override_repartidor, override_horario, override_salida,
          created_by, created_at, updated_at,
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
      const rows = (data ?? []) as unknown as Pedido[]
      for (const p of rows) {
        if (p.lineas) p.lineas.sort((a, b) => a.orden - b.orden)
      }
      return rows
    },
  })
}

/** Mover un pedido a otro repartidor / horario / salida sólo para hoy. */
export function useReasignarPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      fecha: string
      patch: Partial<{
        override_repartidor: Repartidor | null
        override_horario: string | null
        override_salida: 'PRIMERA' | 'SEGUNDA' | null
      }>
    }) => {
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

/** Último pedido de un cliente con sus líneas — para "Mismo que la última vez". */
export function useUltimoPedidoCliente(clienteId: string | null) {
  return useQuery({
    queryKey: ['pedidos-wa', 'ultimo', clienteId] as const,
    enabled: !!clienteId,
    queryFn: async (): Promise<Pedido | null> => {
      if (!clienteId) return null
      const { data, error } = await supabase
        .from('pedidos_wa')
        .select(`
          id, cliente_id, fecha, texto_original, notas_admin, faltas, estado,
          created_by, created_at, updated_at,
          lineas:pedidos_wa_lineas (
            id, pedido_id, orden, cantidad, unidad,
            producto_normalizado, producto_raw,
            subseccion, notas, es_gratis, metodo, created_at
          )
        `)
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      const p = data as Pedido | null
      if (p?.lineas) p.lineas.sort((a, b) => a.orden - b.orden)
      return p
    },
    staleTime: 60_000,
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

// ===== Inventario + Cotejo (Compra del día) =====

export type InventarioLinea = {
  id: string
  fecha: string
  orden: number
  producto_normalizado: string
  unidad: string
  cantidad: number
  notas: string | null
}

export type InventarioDia = {
  fecha: string
  texto_original: string
  created_at: string
  updated_at: string
  lineas: InventarioLinea[]
}

export function useInventarioDelDia(fecha: string) {
  return useQuery({
    queryKey: KEYS.inventario(fecha),
    queryFn: async (): Promise<InventarioDia | null> => {
      const { data, error } = await supabase
        .from('pedidos_wa_inventario')
        .select(`
          fecha, texto_original, created_at, updated_at,
          lineas:pedidos_wa_inventario_lineas (
            id, fecha, orden, producto_normalizado, unidad, cantidad, notas
          )
        `)
        .eq('fecha', fecha)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const inv = data as unknown as InventarioDia
      inv.lineas?.sort((a, b) => a.orden - b.orden)
      return inv
    },
  })
}

type GuardarInventarioInput = {
  fecha: string
  texto: string
  lineas: Array<{
    orden: number
    cantidad: number
    unidad: string
    producto_normalizado: string
    notas: string | null
  }>
}

export function useGuardarInventario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: GuardarInventarioInput) => {
      const { error: errInv } = await supabase
        .from('pedidos_wa_inventario')
        .upsert(
          { fecha: input.fecha, texto_original: input.texto },
          { onConflict: 'fecha' },
        )
      if (errInv) throw errInv

      const { error: errDel } = await supabase
        .from('pedidos_wa_inventario_lineas')
        .delete()
        .eq('fecha', input.fecha)
      if (errDel) throw errDel

      if (input.lineas.length > 0) {
        const rows = input.lineas.map(l => ({
          fecha:                input.fecha,
          orden:                l.orden,
          cantidad:             l.cantidad,
          unidad:               l.unidad,
          producto_normalizado: l.producto_normalizado,
          notas:                l.notas,
        }))
        const { error: errIns } = await supabase
          .from('pedidos_wa_inventario_lineas')
          .insert(rows)
        if (errIns) throw errIns
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.inventario(vars.fecha) })
      qc.invalidateQueries({ queryKey: KEYS.cotejo(vars.fecha) })
    },
  })
}

export function useEliminarInventario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { fecha: string }) => {
      const { error } = await supabase
        .from('pedidos_wa_inventario')
        .delete()
        .eq('fecha', input.fecha)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.inventario(vars.fecha) })
      qc.invalidateQueries({ queryKey: KEYS.cotejo(vars.fecha) })
    },
  })
}

export type CotejoFila = {
  producto:         string
  unidad:           string
  pedido_total:     number
  inventario:       number
  a_comprar:        number
  sobra:            number
  kg_por_caja:      number | null
  pedido_cajas:     number | null
  inventario_cajas: number | null
  a_comprar_cajas:  number | null
}

export function useCotejoDelDia(fecha: string) {
  return useQuery({
    queryKey: KEYS.cotejo(fecha),
    queryFn: async (): Promise<CotejoFila[]> => {
      const { data, error } = await supabase.rpc('pedidos_wa_cotejo', { p_fecha: fecha })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        producto:          String(r.producto ?? ''),
        unidad:            String(r.unidad ?? ''),
        pedido_total:      Number(r.pedido_total ?? 0),
        inventario:        Number(r.inventario ?? 0),
        a_comprar:         Number(r.a_comprar ?? 0),
        sobra:             Number(r.sobra ?? 0),
        kg_por_caja:       r.kg_por_caja == null ? null : Number(r.kg_por_caja),
        pedido_cajas:      r.pedido_cajas == null ? null : Number(r.pedido_cajas),
        inventario_cajas:  r.inventario_cajas == null ? null : Number(r.inventario_cajas),
        a_comprar_cajas:   r.a_comprar_cajas == null ? null : Number(r.a_comprar_cajas),
      }))
    },
  })
}
