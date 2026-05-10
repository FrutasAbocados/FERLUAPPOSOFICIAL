import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type {
  ClientePedido,
  CompraDB,
  CompraExtraccion,
  CompraLineaDB,
  CompraLineaExtraida,
  EstadoPedido,
  LineaParseada,
  Pedido,
  Repartidor,
  Salida,
  TipoDocHolded,
  TipoFactura,
} from './types'

const KEYS = {
  clientes:        ['pedidos_wa', 'clientes'] as const,
  clientesAll:     ['pedidos_wa', 'clientes', 'all'] as const,
  pedidosDelDia:   (fecha: string) => ['pedidos_wa', 'pedidos', fecha] as const,
  pedido:          (id: string) => ['pedidos_wa', 'pedido', id] as const,
  inventario:      (fecha: string) => ['pedidos_wa', 'inventario', fecha] as const,
  cotejo:          (fecha: string) => ['pedidos_wa', 'cotejo', fecha] as const,
  kgPorCaja:       ['pedidos_wa', 'kg_por_caja'] as const,
  comprasMes:      (yyyymm: string) => ['pedidos_wa', 'compras', yyyymm] as const,
  compra:          (id: string) => ['pedidos_wa', 'compra', id] as const,
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
  holded_doc_type: TipoDocHolded | null
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
          override_repartidor, override_horario, override_salida, override_orden,
          holded_invoice_id, holded_invoice_num, holded_invoice_doc_type, holded_invoice_created_at,
          created_by, created_at, updated_at,
          cliente:cliente_id (
            id, nombre, nombre_normalizado, holded_contact_id, holded_doc_type,
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
        override_orden: number | null
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

/** Borra un borrador en Holded y resetea el pedido a 'pendiente' para volver a confirmarlo. */
export function useReemitirBorrador() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { pedido_id: string; fecha: string }) => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; detail?: string; hint?: string }>(
        'borrar-borrador-holded',
        { body: { pedido_id: input.pedido_id } },
      )
      if (error) {
        const ctx = (error as unknown as { context?: { json?: () => Promise<unknown> } }).context
        if (ctx?.json) {
          try {
            const j = await ctx.json() as { error?: string; hint?: string }
            throw new Error(j.hint ? `${j.error} — ${j.hint}` : (j.error ?? error.message))
          } catch (e) {
            if (e instanceof Error && e.message !== error.message) throw e
          }
        }
        throw error
      }
      if (!data || data.error) throw new Error(data?.error ?? 'respuesta vacía')
      return data
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(vars.fecha) })
    },
  })
}

// ─── Recurrentes ─────────────────────────────────────────────────────────────

export type Recurrente = {
  id: string
  cliente_id: string
  nombre: string
  dias_semana: number[]
  activo: boolean
  notas_admin: string | null
  ultima_generacion: string | null
  created_at: string
  updated_at: string
  cliente?: { id: string; nombre: string }
  lineas?: RecurrenteLinea[]
}

export type RecurrenteLinea = {
  id: string
  recurrente_id: string
  orden: number
  producto_normalizado: string
  cantidad: number | string
  unidad: string
  es_gratis: boolean
  subseccion: string | null
  notas: string | null
}

export function useRecurrentes() {
  return useQuery({
    queryKey: ['pedidos_wa', 'recurrentes'] as const,
    queryFn: async (): Promise<Recurrente[]> => {
      const { data, error } = await supabase
        .from('pedidos_wa_recurrentes')
        .select(`
          id, cliente_id, nombre, dias_semana, activo, notas_admin,
          ultima_generacion, created_at, updated_at,
          cliente:cliente_id (id, nombre),
          lineas:pedidos_wa_recurrentes_lineas (
            id, recurrente_id, orden, producto_normalizado,
            cantidad, unidad, es_gratis, subseccion, notas
          )
        `)
        .order('nombre')
      if (error) throw error
      const rows = (data ?? []) as unknown as Recurrente[]
      for (const r of rows) {
        if (r.lineas) r.lineas.sort((a, b) => a.orden - b.orden)
      }
      return rows
    },
  })
}

export function useUpsertRecurrente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      cliente_id: string
      nombre: string
      dias_semana: number[]
      activo: boolean
      notas_admin: string | null
      lineas: Array<Omit<RecurrenteLinea, 'id' | 'recurrente_id'>>
    }) => {
      let recurrenteId = input.id
      if (recurrenteId) {
        const { error } = await supabase
          .from('pedidos_wa_recurrentes')
          .update({
            cliente_id: input.cliente_id,
            nombre: input.nombre,
            dias_semana: input.dias_semana,
            activo: input.activo,
            notas_admin: input.notas_admin,
          })
          .eq('id', recurrenteId)
        if (error) throw error
        const { error: delError } = await supabase
          .from('pedidos_wa_recurrentes_lineas')
          .delete().eq('recurrente_id', recurrenteId)
        if (delError) throw delError
      } else {
        const { data, error } = await supabase
          .from('pedidos_wa_recurrentes')
          .insert({
            cliente_id: input.cliente_id,
            nombre: input.nombre,
            dias_semana: input.dias_semana,
            activo: input.activo,
            notas_admin: input.notas_admin,
          })
          .select('id').single()
        if (error) throw error
        recurrenteId = data.id
      }
      if (input.lineas.length > 0) {
        const { error } = await supabase
          .from('pedidos_wa_recurrentes_lineas')
          .insert(input.lineas.map((l, idx) => ({
            recurrente_id: recurrenteId,
            orden: idx,
            producto_normalizado: l.producto_normalizado,
            cantidad: l.cantidad,
            unidad: l.unidad,
            es_gratis: l.es_gratis,
            subseccion: l.subseccion,
            notas: l.notas,
          })))
        if (error) throw error
      }
      return recurrenteId
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedidos_wa', 'recurrentes'] }),
  })
}

export function useToggleRecurrente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; activo: boolean }) => {
      const { error } = await supabase
        .from('pedidos_wa_recurrentes')
        .update({ activo: input.activo })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedidos_wa', 'recurrentes'] }),
  })
}

export function useDeleteRecurrente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pedidos_wa_recurrentes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedidos_wa', 'recurrentes'] }),
  })
}

/** Generar manualmente los recurrentes de una fecha (ej. "ahora"). */
export function useGenerarRecurrentes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fecha: string): Promise<Array<{ recurrente_id: string; pedido_id: string | null; status: string }>> => {
      const { data, error } = await supabase.rpc('pedidos_wa_recurrentes_generar', { p_fecha: fecha })
      if (error) throw error
      return (data ?? []) as Array<{ recurrente_id: string; pedido_id: string | null; status: string }>
    },
    onSuccess: (_d, fecha) => {
      qc.invalidateQueries({ queryKey: ['pedidos_wa', 'recurrentes'] })
      qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(fecha) })
    },
  })
}

// ─── Productos WA ↔ catálogo Holded ─────────────────────────────────────────

export type ProductoWaConMapeo = {
  producto_normalizado: string  // lowercase clave única
  primer_uso: string             // texto original tal cual (ej: "Cebolla morada")
  veces_usado: number
  holded_product_id: string | null
  holded_product_name: string | null
  source: 'manual' | 'auto_match' | null
}

/** Lista todos los productos distintos en pedidos_wa_lineas + mapeo actual a Holded. */
export function useProductosWa() {
  return useQuery({
    queryKey: ['pedidos_wa', 'productos_wa'] as const,
    queryFn: async (): Promise<ProductoWaConMapeo[]> => {
      const { data, error } = await supabase.rpc('pedidos_wa_productos_resumen')
      if (error) throw error
      return (data ?? []) as ProductoWaConMapeo[]
    },
    staleTime: 30_000,
  })
}

export type CandidatoHolded = {
  product_id: string
  nombre: string
  veces_visto: number
}

/** Búsqueda de productos en el catálogo Holded (vía manager_lineas que ya los tiene). */
export function useBuscarProductosHolded(q: string) {
  return useQuery({
    queryKey: ['pedidos_wa', 'productos_holded_search', q] as const,
    enabled: q.trim().length >= 1,
    queryFn: async (): Promise<CandidatoHolded[]> => {
      const { data, error } = await supabase.rpc('pedidos_wa_buscar_productos_holded', {
        p_query: q.trim(),
        p_limit: 20,
      })
      if (error) throw error
      return (data ?? []) as CandidatoHolded[]
    },
    staleTime: 60_000,
  })
}

export function useUpsertProductoHolded() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { producto_normalizado: string; holded_product_id: string; holded_product_name: string }) => {
      const { error } = await supabase
        .from('pedidos_wa_productos_holded')
        .upsert({
          producto_normalizado: input.producto_normalizado.toLowerCase(),
          holded_product_id: input.holded_product_id,
          holded_product_name: input.holded_product_name,
          source: 'manual',
        }, { onConflict: 'producto_normalizado' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos_wa', 'productos_wa'] })
      qc.invalidateQueries({ queryKey: ['pedidos_wa', 'sugerencias_mapeo'] })
      qc.invalidateQueries({ queryKey: ['pedidos_wa', 'cotejo'] })
    },
  })
}

export function useDeleteProductoHolded() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (producto_normalizado: string) => {
      const { error } = await supabase
        .from('pedidos_wa_productos_holded')
        .delete()
        .eq('producto_normalizado', producto_normalizado.toLowerCase())
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedidos_wa', 'productos_wa'] }),
  })
}

// ─── Sugerencias de mapeo (unificación) ────────────────────────────────────

export type SugerenciaMapeo = {
  producto_raw:           string
  fuente:                 'pedido' | 'inventario'
  veces:                  number
  sugerencia_normalizado: string | null
  sugerencia_holded_id:   string | null
  sugerencia_nombre:      string | null
  confianza:              number | null
}

export function useSugerenciasMapeo() {
  return useQuery({
    queryKey: ['pedidos_wa', 'sugerencias_mapeo'] as const,
    queryFn: async (): Promise<SugerenciaMapeo[]> => {
      const { data, error } = await supabase.rpc('pedidos_wa_sugerencias_mapeo')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        veces:     Number(r.veces ?? 0),
        confianza: r.confianza == null ? null : Number(r.confianza),
      })) as SugerenciaMapeo[]
    },
    staleTime: 30_000,
  })
}

// ─── Logs Holded ────────────────────────────────────────────────────────────

export type HoldedLastLog = {
  pedido_id: string
  log_id: string
  source: 'trigger' | 'manual' | 'retry'
  status: number | null
  ok: boolean
  doc_type: 'invoice' | 'waybill' | null
  holded_id: string | null
  holded_num: string | null
  error_msg: string | null
  created_at: string
}

/** Último log Holded por pedido para una fecha concreta. Permite ver fallos en la UI. */
export function useHoldedLastLogs(fecha: string, pedidoIds: string[]) {
  return useQuery({
    queryKey: ['pedidos_wa', 'holded_logs', fecha, pedidoIds.length] as const,
    enabled: pedidoIds.length > 0,
    queryFn: async (): Promise<Map<string, HoldedLastLog>> => {
      if (pedidoIds.length === 0) return new Map()
      const { data, error } = await supabase
        .from('pedidos_wa_holded_last_log')
        .select('*')
        .in('pedido_id', pedidoIds)
      if (error) throw error
      const map = new Map<string, HoldedLastLog>()
      for (const r of (data ?? []) as HoldedLastLog[]) map.set(r.pedido_id, r)
      return map
    },
    staleTime: 15_000,
  })
}

/** Marca un pedido como 'confirmado'. El trigger de BD dispara la creación de borrador en Holded. */
export function useConfirmarPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; fecha: string }) => {
      const { error } = await supabase
        .from('pedidos_wa')
        .update({ estado: 'confirmado' })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(vars.fecha) })
      // Polling 3-5s para captar el holded_invoice_id que rellena el trigger
      setTimeout(() => qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(vars.fecha) }), 3000)
      setTimeout(() => qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(vars.fecha) }), 8000)
    },
  })
}

/** Reordena masivamente las paradas de un repartidor en una fecha. Asigna 1..N. */
export function useReordenarRuta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { fecha: string; repartidor: Repartidor; ids: string[] }) => {
      const { error } = await supabase.rpc('pedidos_wa_reordenar_ruta', {
        p_fecha: input.fecha,
        p_repartidor: input.repartidor,
        p_orden: input.ids,
      })
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

// ===== Líneas de pedido (CRUD inline desde Hoy) =====

type ActualizarLineaInput = {
  id: string
  fecha: string
  patch: Partial<{
    cantidad: number
    unidad: string
    producto_normalizado: string
    subseccion: string | null
    notas: string | null
    es_gratis: boolean
  }>
}

export function useActualizarLineaPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ActualizarLineaInput) => {
      const { error } = await supabase
        .from('pedidos_wa_lineas')
        .update(input.patch)
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(vars.fecha) })
      qc.invalidateQueries({ queryKey: KEYS.cotejo(vars.fecha) })
    },
  })
}

export function useEliminarLineaPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; fecha: string }) => {
      const { error } = await supabase
        .from('pedidos_wa_lineas')
        .delete()
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(vars.fecha) })
      qc.invalidateQueries({ queryKey: KEYS.cotejo(vars.fecha) })
    },
  })
}

export function useAgregarLineaPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      pedido_id: string
      fecha: string
      linea: {
        cantidad: number
        unidad: string
        producto_normalizado: string
        subseccion: string | null
        notas: string | null
        es_gratis: boolean
      }
    }) => {
      // Calcular orden: max(orden) + 1
      const { data: existentes } = await supabase
        .from('pedidos_wa_lineas')
        .select('orden')
        .eq('pedido_id', input.pedido_id)
        .order('orden', { ascending: false })
        .limit(1)
      const proxOrden = existentes && existentes.length > 0
        ? (existentes[0].orden as number) + 1
        : 1
      const row = {
        pedido_id:            input.pedido_id,
        orden:                proxOrden,
        cantidad:             input.linea.cantidad,
        unidad:               input.linea.unidad,
        producto_normalizado: input.linea.producto_normalizado,
        producto_raw:         input.linea.producto_normalizado,
        subseccion:           input.linea.subseccion,
        notas:                input.linea.notas,
        es_gratis:            input.linea.es_gratis,
        metodo:               'manual',
      }
      const { error } = await supabase.from('pedidos_wa_lineas').insert(row)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(vars.fecha) })
      qc.invalidateQueries({ queryKey: KEYS.cotejo(vars.fecha) })
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

// ===== CRUD factores kg/caja =====

export type KgPorCajaRow = {
  producto_normalizado: string
  kg_por_caja: number
  updated_at: string
}

export function useFactoresKgCaja() {
  return useQuery({
    queryKey: KEYS.kgPorCaja,
    queryFn: async (): Promise<KgPorCajaRow[]> => {
      const { data, error } = await supabase
        .from('pedidos_wa_kg_por_caja')
        .select('producto_normalizado, kg_por_caja, updated_at')
        .order('producto_normalizado', { ascending: true })
      if (error) throw error
      return (data ?? []).map(r => ({
        producto_normalizado: String(r.producto_normalizado ?? ''),
        kg_por_caja:          Number(r.kg_por_caja ?? 0),
        updated_at:           String(r.updated_at ?? ''),
      }))
    },
  })
}

export function useUpsertFactorKgCaja() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { producto_normalizado: string; kg_por_caja: number }) => {
      if (input.kg_por_caja <= 0) throw new Error('kg/caja debe ser > 0')
      const producto = input.producto_normalizado.trim().toLowerCase()
      if (!producto) throw new Error('Producto vacío')
      const { error } = await supabase
        .from('pedidos_wa_kg_por_caja')
        .upsert(
          { producto_normalizado: producto, kg_por_caja: input.kg_por_caja },
          { onConflict: 'producto_normalizado' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.kgPorCaja })
      // Invalidar todos los cotejos (afecta a TODOS los días)
      qc.invalidateQueries({ queryKey: ['pedidos_wa', 'cotejo'] })
    },
  })
}

export function useEliminarFactorKgCaja() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { producto_normalizado: string }) => {
      const { error } = await supabase
        .from('pedidos_wa_kg_por_caja')
        .delete()
        .eq('producto_normalizado', input.producto_normalizado)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.kgPorCaja })
      qc.invalidateQueries({ queryKey: ['pedidos_wa', 'cotejo'] })
    },
  })
}

// ─── Compras a proveedores (Fase 3) ──────────────────────────────────────────

export type CompraConLineas = CompraDB & { lineas: CompraLineaDB[] }

export function useComprasMes(yyyymm: string) {
  return useQuery({
    queryKey: KEYS.comprasMes(yyyymm),
    queryFn: async (): Promise<CompraConLineas[]> => {
      const inicio = `${yyyymm}-01`
      const [y, m] = yyyymm.split('-').map(Number)
      const finFecha = new Date(y, m, 1)
      const fin = `${finFecha.getFullYear()}-${String(finFecha.getMonth() + 1).padStart(2, '0')}-01`

      const { data, error } = await supabase
        .from('pedidos_wa_compras')
        .select('*, lineas:pedidos_wa_compras_lineas(*)')
        .gte('fecha', inicio)
        .lt('fecha', fin)
        .order('fecha', { ascending: false })
      if (error) throw error
      return (data ?? []).map((c) => ({
        ...c,
        lineas: ((c as { lineas?: CompraLineaDB[] }).lineas ?? [])
          .slice()
          .sort((a, b) => a.orden - b.orden),
      })) as CompraConLineas[]
    },
  })
}

export async function parsearFacturaProveedor(
  file: File,
): Promise<CompraExtraccion> {
  const b64 = await fileToBase64(file)
  const { data, error } = await supabase.functions.invoke<CompraExtraccion | { error: string }>(
    'parsear-factura-proveedor',
    { body: { pdf_base64: b64, filename: file.name } },
  )
  if (error) throw error
  if (!data || 'error' in data) {
    throw new Error((data as { error?: string })?.error ?? 'Respuesta vacía del parser')
  }
  return repararLineasExtraccion(data as CompraExtraccion)
}

/**
 * Defensa contra extracciones donde el modelo devuelve precio_unitario = 0
 * pero sí ha sacado bien cantidad e importe. Si cantidad × precio no cuadra
 * con importe (tolerancia 0.05€) y el importe es coherente, se recalcula
 * el precio desde importe/cantidad. Idempotente.
 */
function repararLineasExtraccion(extr: CompraExtraccion): CompraExtraccion {
  const lineas = (extr.lineas ?? []).map((l) => {
    const cantidad = Number(l.cantidad ?? 0)
    const importe  = Number(l.importe ?? 0)
    const precio   = Number(l.precio_unitario ?? 0)
    if (cantidad <= 0) return l
    const cuadra = Math.abs(cantidad * precio - importe) <= 0.05
    if (cuadra && precio > 0) return l
    if (importe > 0) {
      return { ...l, precio_unitario: Number((importe / cantidad).toFixed(4)) }
    }
    return l
  })
  return { ...extr, lineas }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const idx = result.indexOf(',')
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Lectura PDF falló'))
    reader.readAsDataURL(file)
  })
}

type GuardarCompraInput = {
  proveedor_holded_id: string
  proveedor_nombre:    string
  num_factura:         string
  fecha:               string
  total_bruto:         number
  total_iva:           number
  total:               number
  iva_desglose:        CompraExtraccion['iva_desglose']
  pdf_filename:        string | null
  raw_extraction:      CompraExtraccion
  notas:               string | null
  lineas:              CompraLineaExtraida[]
}

export function useGuardarCompra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: GuardarCompraInput): Promise<CompraDB> => {
      const { data: compra, error: errCab } = await supabase
        .from('pedidos_wa_compras')
        .insert({
          proveedor_holded_id: input.proveedor_holded_id,
          proveedor_nombre:    input.proveedor_nombre,
          num_factura:         input.num_factura,
          fecha:               input.fecha,
          total_bruto:         input.total_bruto,
          total_iva:           input.total_iva,
          total:               input.total,
          iva_desglose:        input.iva_desglose,
          pdf_filename:        input.pdf_filename,
          raw_extraction:      input.raw_extraction,
          notas:               input.notas,
        })
        .select('*')
        .single()
      if (errCab) throw errCab

      if (input.lineas.length > 0) {
        const filas = input.lineas.map((l) => ({
          compra_id:        compra.id,
          orden:            l.orden,
          codigo_proveedor: l.codigo_proveedor,
          descripcion:      l.descripcion,
          cantidad:         l.cantidad,
          unidad:           l.unidad,
          precio_unitario:  l.precio_unitario,
          iva_pct:          l.iva_pct,
          importe:          l.importe,
          notas:            l.notas,
        }))
        const { error: errLin } = await supabase
          .from('pedidos_wa_compras_lineas')
          .insert(filas)
        if (errLin) {
          // rollback
          await supabase.from('pedidos_wa_compras').delete().eq('id', compra.id)
          throw errLin
        }
      }
      return compra as CompraDB
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos_wa', 'compras'] })
    },
  })
}

export function useEliminarCompra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pedidos_wa_compras').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos_wa', 'compras'] })
    },
  })
}

// ─── Subir compra a Holded (Fase 3b) ─────────────────────────────────────────

export type SubirCompraDryRun = {
  ok: true
  dry_run: true
  holded_endpoint: string
  body: Record<string, unknown>
  summary: {
    proveedor: string
    num_factura: string
    fecha: string
    lineas: number
    total_bruto: number
    total: number
  }
}

export type SubirCompraOk = {
  ok: true
  holded_purchase_id: string
  holded_purchase_num: string | null
}

export type SubirCompraResult = SubirCompraDryRun | SubirCompraOk

export function useSubirCompraAHolded() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { compra_id: string; dry_run?: boolean }): Promise<SubirCompraResult> => {
      const { data, error } = await supabase.functions.invoke<SubirCompraResult | { error: string; detail?: string; sent_body?: unknown }>(
        'compra-a-holded',
        { body: { compra_id: input.compra_id, dry_run: input.dry_run === true } },
      )
      if (error) {
        // Edge devuelve detalle JSON aunque sea status != 2xx — extraerlo
        const ctx = (error as unknown as { context?: { json?: () => Promise<unknown> } }).context
        if (ctx?.json) {
          try {
            const j = await ctx.json() as { error?: string; detail?: string }
            throw new Error(j.error || j.detail || error.message)
          } catch (e) {
            if (e instanceof Error && e.message !== error.message) throw e
          }
        }
        throw error
      }
      if (!data || (data as { error?: string }).error) {
        throw new Error((data as { error?: string })?.error ?? 'Respuesta vacía')
      }
      return data as SubirCompraResult
    },
    onSuccess: (res) => {
      if ('holded_purchase_id' in res && res.holded_purchase_id) {
        qc.invalidateQueries({ queryKey: ['pedidos_wa', 'compras'] })
      }
    },
  })
}

// ─── Subir pedido a Holded (Fase 3c) ─────────────────────────────────────────

export type LineaResuelta = {
  linea_id: string
  orden: number
  producto_normalizado: string
  cantidad: number
  unidad: string
  es_gratis: boolean
  iva_pct: number
  precio_resuelto: number | null
  precio_fuente: 'historico_cliente' | 'no_resuelto' | 'gratis'
  precio_fecha: string | null
  total_estimado: number
}

export type SubirPedidoDryRun = {
  ok: true
  dry_run: true
  holded_endpoint: string
  doc_type: TipoDocHolded
  body: Record<string, unknown>
  summary: {
    cliente: string
    fecha: string
    doc_type: TipoDocHolded
    total_lineas: number
    resueltas: number
    no_resueltas: number
    gratis: number
    total_estimado: number
  }
  lineas_resueltas: LineaResuelta[]
}

export type SubirPedidoOk = {
  ok: true
  holded_invoice_id: string
  holded_invoice_num: string | null
  doc_type: TipoDocHolded
}

export type SubirPedidoResult = SubirPedidoDryRun | SubirPedidoOk

export function useSubirPedidoAHolded() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { pedido_id: string; fecha: string; dry_run?: boolean }): Promise<SubirPedidoResult> => {
      const { data, error } = await supabase.functions.invoke<SubirPedidoResult | { error: string }>(
        'pedido-a-holded',
        { body: { pedido_id: input.pedido_id, dry_run: input.dry_run === true } },
      )
      if (error) {
        const ctx = (error as unknown as { context?: { json?: () => Promise<unknown> } }).context
        if (ctx?.json) {
          try {
            const j = await ctx.json() as { error?: string; detail?: string }
            throw new Error(j.error || j.detail || error.message)
          } catch (e) {
            if (e instanceof Error && e.message !== error.message) throw e
          }
        }
        throw error
      }
      if (!data || (data as { error?: string }).error) {
        throw new Error((data as { error?: string })?.error ?? 'Respuesta vacía')
      }
      return data as SubirPedidoResult
    },
    onSuccess: (res, vars) => {
      if ('holded_invoice_id' in res && res.holded_invoice_id) {
        qc.invalidateQueries({ queryKey: KEYS.pedidosDelDia(vars.fecha) })
      }
    },
  })
}
