import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type {
  BorradorLinea,
  BorradorResumen,
  CompraCandidata,
  HoldedLinea,
  LineaEditable,
  RetiradaFila,
  RetiradaFiltros,
  RevisionSombraActual,
  Traza,
  TrazaLineaEstado,
  TrazaResumen,
  VerifactuSimulacion,
  VerifactuXmlSimulacion,
} from './types'

type DbRow = Record<string, unknown>

const str = (value: unknown): string => String(value ?? '')
const nullableStr = (value: unknown): string | null => value == null ? null : String(value)
const num = (value: unknown): number => Number(value ?? 0)
const nullableNum = (value: unknown): number | null => value == null ? null : Number(value)
const bool = (value: unknown): boolean => value === true || value === 'true'

const KEYS = {
  all: ['facturacion'] as const,
  bandeja: ['facturacion', 'bandeja'] as const,
  lineas: (id: string | null) => ['facturacion', 'borrador', id, 'lineas'] as const,
  holded: (id: string | null) => ['facturacion', 'holded', id, 'lineas'] as const,
  trazas: (id: string | null) => ['facturacion', 'borrador', id, 'trazas'] as const,
  candidatas: (texto: string, fecha: string) => ['facturacion', 'trazas', 'candidatas', texto, fecha] as const,
  retirada: (f: RetiradaFiltros) => ['facturacion', 'trazas', 'retirada', f] as const,
}

const TRAZA_COLS = 'id, borrador_linea_id, alcance, cantidad_imputada, unidad, lote, origen, proveedor_nombre, num_factura, fecha_compra, descripcion_compra, confianza, metodo, compra_id, compra_linea_id, created_at'

function toTraza(row: DbRow): Traza {
  return {
    id: str(row.id),
    borrador_linea_id: str(row.borrador_linea_id),
    alcance: str(row.alcance) as Traza['alcance'],
    cantidad_imputada: nullableNum(row.cantidad_imputada),
    unidad: nullableStr(row.unidad),
    lote: nullableStr(row.lote),
    origen: nullableStr(row.origen),
    proveedor_nombre: str(row.proveedor_nombre),
    num_factura: nullableStr(row.num_factura),
    fecha_compra: str(row.fecha_compra),
    descripcion_compra: nullableStr(row.descripcion_compra),
    confianza: str(row.confianza) as Traza['confianza'],
    metodo: str(row.metodo) as Traza['metodo'],
    compra_id: nullableStr(row.compra_id),
    compra_linea_id: nullableStr(row.compra_linea_id),
    created_at: str(row.created_at),
  }
}

export async function fetchFacturacionBandeja(): Promise<BorradorResumen[]> {
  const [{ data, error }, revisionesResult, simulacionesResult, xmlResult, trazasResult] = await Promise.all([
    supabase.rpc('facturacion_bandeja'),
    supabase.rpc('facturacion_revision_sombra_actual'),
    supabase.rpc('facturacion_verifactu_simulaciones_actual'),
    supabase.rpc('facturacion_verifactu_xml_simulaciones_actual'),
    supabase.from('facturacion_borrador_traza_resumen').select('*'),
  ])
  if (error) throw error
  if (revisionesResult.error) throw revisionesResult.error
  if (simulacionesResult.error) throw simulacionesResult.error
  if (xmlResult.error) throw xmlResult.error
  if (trazasResult.error) throw trazasResult.error

  const trazas = new Map(
    ((trazasResult.data ?? []) as DbRow[]).map((row) => {
      const resumen: TrazaResumen = {
        borrador_id: str(row.borrador_id),
        lineas: num(row.lineas),
        completas: num(row.completas),
        solo_lote: num(row.solo_lote),
        parciales: num(row.parciales),
        sin_traza: num(row.sin_traza),
        puede_cerrar: bool(row.puede_cerrar),
        confianza_peor: nullableStr(row.confianza_peor) as TrazaResumen['confianza_peor'],
      }
      return [resumen.borrador_id, resumen] as const
    }),
  )

  const revisiones = new Map(
    ((revisionesResult.data ?? []) as DbRow[]).map((row) => {
      const revision: RevisionSombraActual = {
        borrador_id: str(row.borrador_id),
        accion: str(row.accion) as RevisionSombraActual['accion'],
        secuencia: num(row.secuencia),
        revision_documento: num(row.revision_documento),
        ocurrido_at: str(row.ocurrido_at),
        motivo: nullableStr(row.motivo),
        snapshot_sha256: nullableStr(row.snapshot_sha256),
        vigente: bool(row.vigente),
        motivo_invalidez: nullableStr(row.motivo_invalidez),
      }
      return [revision.borrador_id, revision] as const
    }),
  )

  const simulaciones = new Map(
    ((simulacionesResult.data ?? []) as DbRow[]).map((row) => {
      const simulacion: VerifactuSimulacion = {
        borrador_id: str(row.borrador_id),
        simulacion_id: num(row.simulacion_id),
        revision_evento_id: num(row.revision_evento_id),
        secuencia: num(row.secuencia),
        numero_simulado: str(row.numero_simulado),
        fecha_expedicion: str(row.fecha_expedicion),
        tipo_factura: str(row.tipo_factura) as VerifactuSimulacion['tipo_factura'],
        cuota_total: num(row.cuota_total),
        importe_total: num(row.importe_total),
        huella_anterior: nullableStr(row.huella_anterior),
        huella: str(row.huella),
        generado_at: str(row.generado_at),
        vigente: bool(row.vigente),
      }
      return [simulacion.borrador_id, simulacion] as const
    }),
  )

  const xmlSimulaciones = new Map(
    ((xmlResult.data ?? []) as DbRow[]).map((row) => {
      const xml: VerifactuXmlSimulacion = {
        borrador_id: str(row.borrador_id),
        xml_simulacion_id: num(row.xml_simulacion_id),
        simulacion_id: num(row.simulacion_id),
        numero_simulado: str(row.numero_simulado),
        xml_sha256: str(row.xml_sha256),
        xsd_version: str(row.xsd_version) as VerifactuXmlSimulacion['xsd_version'],
        generado_at: str(row.generado_at),
        vigente: bool(row.vigente),
      }
      return [xml.borrador_id, xml] as const
    }),
  )

  return ((data ?? []) as DbRow[]).map((row): BorradorResumen => ({
    borrador_id: str(row.borrador_id),
    numero_interno: num(row.numero_interno),
    revision: num(row.revision),
    estado: str(row.estado) as BorradorResumen['estado'],
    motivo_bloqueo: nullableStr(row.motivo_bloqueo),
    tipo_documento: str(row.tipo_documento) as BorradorResumen['tipo_documento'],
    fecha_operacion: str(row.fecha_operacion),
    updated_at: str(row.updated_at),
    cliente_id: str(row.cliente_id),
    cliente_nombre: str(row.cliente_nombre),
    cliente_comercial: nullableStr(row.cliente_comercial),
    cliente_estado: str(row.cliente_estado) as BorradorResumen['cliente_estado'],
    holded_contact_id: nullableStr(row.holded_contact_id),
    pedido_wa_id: nullableStr(row.pedido_wa_id),
    pedido_fecha: nullableStr(row.pedido_fecha),
    pedido_cliente_nombre: nullableStr(row.pedido_cliente_nombre),
    holded_documento_id: nullableStr(row.holded_documento_id),
    holded_documento_numero: nullableStr(row.holded_documento_numero),
    holded_documento_tipo: nullableStr(row.holded_documento_tipo),
    holded_estado: nullableStr(row.holded_estado),
    holded_actualizado_at: nullableStr(row.holded_actualizado_at),
    lineas: num(row.lineas),
    lineas_pendientes: num(row.lineas_pendientes),
    base_provisional: num(row.base_provisional),
    iva_provisional: num(row.iva_provisional),
    recargo_provisional: num(row.recargo_provisional),
    total_provisional: num(row.total_provisional),
    holded_lineas: num(row.holded_lineas),
    holded_subtotal: nullableNum(row.holded_subtotal),
    holded_total: nullableNum(row.holded_total),
    diferencia_holded: nullableNum(row.diferencia_holded),
    revision_sombra: revisiones.get(str(row.borrador_id)) ?? null,
    verifactu_simulacion: simulaciones.get(str(row.borrador_id)) ?? null,
    verifactu_xml: xmlSimulaciones.get(str(row.borrador_id)) ?? null,
    traza: trazas.get(str(row.borrador_id)) ?? null,
  }))
}

export function useFacturacionBandeja() {
  return useQuery({
    queryKey: KEYS.bandeja,
    queryFn: fetchFacturacionBandeja,
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
  })
}

export function useBorradorLineas(borradorId: string | null) {
  return useQuery({
    queryKey: KEYS.lineas(borradorId),
    enabled: !!borradorId,
    queryFn: async (): Promise<BorradorLinea[]> => {
      const { data, error } = await supabase
        .from('facturacion_borrador_lineas')
        .select('id, borrador_id, pedido_wa_linea_id, orden, producto_referencia, producto_origen, descripcion, cantidad, unidad, precio_unitario, precio_estado, precio_fuente, precio_fecha, descuento_pct, iva_pct, recargo_equivalencia_pct, regimen_iva, base_provisional, cuota_iva_provisional, cuota_recargo_provisional, total_provisional, updated_at')
        .eq('borrador_id', borradorId as string)
        .order('orden')
      if (error) throw error

      return ((data ?? []) as DbRow[]).map((row): BorradorLinea => ({
        id: str(row.id),
        borrador_id: str(row.borrador_id),
        pedido_wa_linea_id: nullableStr(row.pedido_wa_linea_id),
        orden: num(row.orden),
        producto_referencia: nullableStr(row.producto_referencia),
        producto_origen: str(row.producto_origen) as BorradorLinea['producto_origen'],
        descripcion: str(row.descripcion),
        cantidad: num(row.cantidad),
        unidad: str(row.unidad),
        precio_unitario: nullableNum(row.precio_unitario),
        precio_estado: str(row.precio_estado) as BorradorLinea['precio_estado'],
        precio_fuente: nullableStr(row.precio_fuente),
        precio_fecha: nullableStr(row.precio_fecha),
        descuento_pct: num(row.descuento_pct),
        iva_pct: num(row.iva_pct),
        recargo_equivalencia_pct: num(row.recargo_equivalencia_pct),
        regimen_iva: str(row.regimen_iva),
        base_provisional: nullableNum(row.base_provisional),
        cuota_iva_provisional: nullableNum(row.cuota_iva_provisional),
        cuota_recargo_provisional: nullableNum(row.cuota_recargo_provisional),
        total_provisional: nullableNum(row.total_provisional),
        updated_at: str(row.updated_at),
      }))
    },
  })
}

export function useHoldedLineas(documentoId: string | null) {
  return useQuery({
    queryKey: KEYS.holded(documentoId),
    enabled: !!documentoId,
    queryFn: async (): Promise<HoldedLinea[]> => {
      const { data, error } = await supabase
        .from('manager_lineas')
        .select('id, product_id, nombre, units, price, subtotal, tax_rate')
        .eq('factura_id', documentoId as string)
        .order('id')
      if (error) throw error
      return ((data ?? []) as DbRow[]).map((row): HoldedLinea => ({
        id: str(row.id),
        product_id: nullableStr(row.product_id),
        nombre: str(row.nombre),
        units: num(row.units),
        price: num(row.price),
        subtotal: num(row.subtotal),
        tax_rate: num(row.tax_rate),
      }))
    },
  })
}

async function recalcular(borradorId: string) {
  const { error } = await supabase.rpc('facturacion_recalcular_borrador_estado', {
    p_borrador_id: borradorId,
  })
  if (error) throw error
}

export function useGuardarLineas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { borradorId: string; lineas: LineaEditable[] }) => {
      const { error } = await supabase.rpc('facturacion_guardar_lineas', {
        p_borrador_id: input.borradorId,
        p_lineas: input.lineas.map((linea) => ({
          id: linea.id,
          descripcion: linea.descripcion.trim(),
          cantidad: Number(linea.cantidad),
          unidad: linea.unidad.trim(),
          precio_unitario: linea.precio_unitario.trim() === '' ? null : Number(linea.precio_unitario),
          descuento_pct: Number(linea.descuento_pct),
          iva_pct: Number(linea.iva_pct),
          recargo_equivalencia_pct: Number(linea.recargo_equivalencia_pct),
        })),
      })
      if (error) throw error
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lineas(input.borradorId) })
      queryClient.invalidateQueries({ queryKey: KEYS.bandeja })
    },
  })
}

export function useAnadirLinea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { borradorId: string; orden: number }) => {
      const { error } = await supabase.from('facturacion_borrador_lineas').insert({
        borrador_id: input.borradorId,
        orden: input.orden,
        producto_origen: 'manual',
        descripcion: 'Nueva línea',
        cantidad: 1,
        unidad: 'kg',
        precio_unitario: null,
        precio_estado: 'pendiente',
        iva_pct: 4,
      })
      if (error) throw error
      await recalcular(input.borradorId)
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lineas(input.borradorId) })
      queryClient.invalidateQueries({ queryKey: KEYS.bandeja })
    },
  })
}

export function useEliminarLinea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { borradorId: string; lineaId: string }) => {
      const { error } = await supabase
        .from('facturacion_borrador_lineas')
        .delete()
        .eq('id', input.lineaId)
        .eq('borrador_id', input.borradorId)
      if (error) throw error
      await recalcular(input.borradorId)
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lineas(input.borradorId) })
      queryClient.invalidateQueries({ queryKey: KEYS.bandeja })
    },
  })
}

export function useRecalcularBorrador() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: recalcular,
    onSuccess: (_data, borradorId) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lineas(borradorId) })
      queryClient.invalidateQueries({ queryKey: KEYS.bandeja })
    },
  })
}

export function useCerrarRevisionSombra() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (borradorId: string) => {
      const { data, error } = await supabase.rpc('facturacion_cerrar_revision_sombra', {
        p_borrador_id: borradorId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all })
    },
  })
}

export function useReabrirRevisionSombra() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { borradorId: string; motivo: string }) => {
      const { data, error } = await supabase.rpc('facturacion_reabrir_revision_sombra', {
        p_borrador_id: input.borradorId,
        p_motivo: input.motivo,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all })
    },
  })
}

export function useGenerarVerifactuSimulacion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (borradorId: string) => {
      const { data, error } = await supabase.rpc('facturacion_generar_verifactu_simulacion', {
        p_borrador_id: borradorId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all })
    },
  })
}

export function useGenerarVerifactuXml() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (borradorId: string) => {
      const { data, error } = await supabase.rpc('facturacion_generar_verifactu_xml_simulacion', {
        p_borrador_id: borradorId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all })
    },
  })
}

export async function obtenerVerifactuXml(borradorId: string): Promise<{
  nombreArchivo: string
  contenidoXml: string
  sha256: string
}> {
  const { data, error } = await supabase.rpc('facturacion_verifactu_xml_obtener', {
    p_borrador_id: borradorId,
  })
  if (error) throw error
  const row = ((data ?? []) as DbRow[])[0]
  if (!row) throw new Error('No hay un XML A8 disponible para este borrador.')
  return {
    nombreArchivo: str(row.nombre_archivo),
    contenidoXml: str(row.contenido_xml),
    sha256: str(row.xml_sha256),
  }
}

// ─── Trazabilidad ────────────────────────────────────────────────────────────

/** Estado por línea + trazas vigentes de un borrador, en una sola consulta. */
export function useTrazasBorrador(borradorId: string | null) {
  return useQuery({
    queryKey: KEYS.trazas(borradorId),
    enabled: !!borradorId,
    queryFn: async (): Promise<{ estados: TrazaLineaEstado[]; trazas: Traza[] }> => {
      const [estadoRes, trazasRes] = await Promise.all([
        supabase
          .from('facturacion_linea_traza_estado')
          .select('borrador_linea_id, borrador_id, descripcion, cantidad, unidad, cantidad_trazada, estado_traza, n_trazas, confianza_peor')
          .eq('borrador_id', borradorId as string),
        supabase
          .from('facturacion_linea_trazas_vigentes')
          .select(TRAZA_COLS)
          .eq('borrador_id', borradorId as string)
          .order('fecha_compra', { ascending: false }),
      ])
      if (estadoRes.error) throw estadoRes.error
      if (trazasRes.error) throw trazasRes.error

      return {
        estados: ((estadoRes.data ?? []) as DbRow[]).map((row): TrazaLineaEstado => ({
          borrador_linea_id: str(row.borrador_linea_id),
          borrador_id: str(row.borrador_id),
          descripcion: str(row.descripcion),
          cantidad: num(row.cantidad),
          unidad: str(row.unidad),
          cantidad_trazada: num(row.cantidad_trazada),
          estado_traza: str(row.estado_traza) as TrazaLineaEstado['estado_traza'],
          n_trazas: num(row.n_trazas),
          confianza_peor: nullableStr(row.confianza_peor) as TrazaLineaEstado['confianza_peor'],
        })),
        trazas: ((trazasRes.data ?? []) as DbRow[]).map(toTraza),
      }
    },
  })
}

/** Resolución automática del borrador entero. */
export function useTrazarBorrador() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { borradorId: string; ventanaDias?: number }) => {
      const { data, error } = await supabase.rpc('facturacion_trazar_borrador', {
        p_borrador_id: input.borradorId,
        p_ventana_dias: input.ventanaDias ?? 15,
      })
      if (error) throw error
      const filas = (data ?? []) as DbRow[]
      return {
        lineas: filas.length,
        creadas: filas.reduce((sum, row) => sum + num(row.trazas_creadas), 0),
        sinTraza: filas.filter((row) => str(row.estado_traza) === 'sin_traza').length,
      }
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: KEYS.trazas(input.borradorId) })
      queryClient.invalidateQueries({ queryKey: KEYS.bandeja })
    },
  })
}

/**
 * Líneas de compra que pueden asignarse a mano. Busca por texto sobre la
 * descripción del proveedor, no por producto: cuando el automático falla suele
 * ser justo porque el nombre no cuadra con ningún alias.
 */
export function useComprasCandidatas(texto: string, hasta: string, dias = 30) {
  const limpio = texto.trim()
  return useQuery({
    queryKey: KEYS.candidatas(limpio, hasta),
    enabled: limpio.length >= 3,
    queryFn: async (): Promise<CompraCandidata[]> => {
      const desde = new Date(hasta)
      desde.setDate(desde.getDate() - dias)
      const { data, error } = await supabase
        .from('facturacion_compra_linea_saldo')
        .select('compra_linea_id, compra_id, fecha_compra, proveedor_nombre, num_factura, descripcion, lote, origen, unidad, cantidad, cantidad_disponible')
        .ilike('descripcion', `%${limpio}%`)
        .gte('fecha_compra', desde.toISOString().slice(0, 10))
        .lte('fecha_compra', hasta)
        .order('fecha_compra', { ascending: false })
        .limit(40)
      if (error) throw error
      return ((data ?? []) as DbRow[]).map((row): CompraCandidata => ({
        compra_linea_id: str(row.compra_linea_id),
        compra_id: str(row.compra_id),
        fecha_compra: str(row.fecha_compra),
        proveedor_nombre: str(row.proveedor_nombre),
        num_factura: nullableStr(row.num_factura),
        descripcion: str(row.descripcion),
        lote: nullableStr(row.lote),
        origen: nullableStr(row.origen),
        unidad: str(row.unidad),
        cantidad: num(row.cantidad),
        cantidad_disponible: num(row.cantidad_disponible),
      }))
    },
  })
}

/**
 * Asignación manual. Imputa cantidad solo si la unidad de venta coincide con la
 * de compra; si no, enlaza el lote sin cantidad. No se convierte a ojo.
 */
export function useAsignarTrazaManual() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      borradorId: string
      borradorLineaId: string
      unidadVenta: string
      cantidadPendiente: number
      compra: CompraCandidata
    }) => {
      const mismaUnidad = input.compra.unidad === input.unidadVenta
      const cantidad = Math.min(input.cantidadPendiente, input.compra.cantidad_disponible)
      const imputaCantidad = mismaUnidad && cantidad > 0

      const { error } = await supabase.from('facturacion_linea_trazas').insert({
        borrador_linea_id: input.borradorLineaId,
        // El trigger lo deriva de la línea; se envía por no dejarlo nulo.
        borrador_id: input.borradorId,
        fuente: 'compra_wa',
        compra_id: input.compra.compra_id,
        compra_linea_id: input.compra.compra_linea_id,
        alcance: imputaCantidad ? 'cantidad' : 'lote',
        cantidad_imputada: imputaCantidad ? cantidad : null,
        unidad: imputaCantidad ? input.compra.unidad : null,
        lote: input.compra.lote,
        origen: input.compra.origen,
        proveedor_nombre: input.compra.proveedor_nombre,
        num_factura: input.compra.num_factura,
        fecha_compra: input.compra.fecha_compra,
        descripcion_compra: input.compra.descripcion,
        metodo: 'manual',
        confianza: 'alta',
      })
      if (error) throw error
      return { imputaCantidad, cantidad }
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: KEYS.trazas(input.borradorId) })
      queryClient.invalidateQueries({ queryKey: KEYS.bandeja })
    },
  })
}

/**
 * Anular = insertar una fila que anula a la original, con motivo. Nunca se
 * edita ni se borra: la traza equivocada sigue siendo parte del historial.
 */
export function useAnularTraza() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { borradorId: string; traza: Traza; motivo: string }) => {
      const { traza } = input
      const { error } = await supabase.from('facturacion_linea_trazas').insert({
        borrador_linea_id: traza.borrador_linea_id,
        borrador_id: input.borradorId,
        fuente: 'compra_wa',
        compra_id: traza.compra_id,
        compra_linea_id: traza.compra_linea_id,
        alcance: traza.alcance,
        cantidad_imputada: traza.cantidad_imputada,
        unidad: traza.unidad,
        lote: traza.lote,
        origen: traza.origen,
        proveedor_nombre: traza.proveedor_nombre,
        num_factura: traza.num_factura,
        fecha_compra: traza.fecha_compra,
        descripcion_compra: traza.descripcion_compra,
        metodo: 'manual',
        confianza: traza.confianza,
        anula_traza_id: traza.id,
        motivo: input.motivo.trim(),
      })
      if (error) throw error
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: KEYS.trazas(input.borradorId) })
      queryClient.invalidateQueries({ queryKey: KEYS.bandeja })
    },
  })
}

/** Paso adelante: de un lote o factura de compra a los clientes que lo recibieron. */
export function useRetirada(filtros: RetiradaFiltros, habilitado: boolean) {
  return useQuery({
    queryKey: KEYS.retirada(filtros),
    enabled: habilitado,
    queryFn: async (): Promise<RetiradaFila[]> => {
      const { data, error } = await supabase.rpc('facturacion_trazabilidad_retirada', {
        p_lote: filtros.lote?.trim() || null,
        p_num_factura: filtros.numFactura?.trim() || null,
        p_proveedor: filtros.proveedor?.trim() || null,
        p_desde: filtros.desde || null,
        p_hasta: filtros.hasta || null,
      })
      if (error) throw error
      return ((data ?? []) as DbRow[]).map((row): RetiradaFila => ({
        traza_id: str(row.traza_id),
        lote: nullableStr(row.lote),
        origen: nullableStr(row.origen),
        proveedor_nombre: str(row.proveedor_nombre),
        num_factura: nullableStr(row.num_factura),
        fecha_compra: str(row.fecha_compra),
        descripcion_compra: nullableStr(row.descripcion_compra),
        cliente_nombre: str(row.cliente_nombre),
        cliente_comercial: nullableStr(row.cliente_comercial),
        numero_interno: num(row.numero_interno),
        fecha_operacion: str(row.fecha_operacion),
        descripcion_venta: str(row.descripcion_venta),
        cantidad_vendida: num(row.cantidad_vendida),
        unidad_venta: str(row.unidad_venta),
        alcance: str(row.alcance) as RetiradaFila['alcance'],
        cantidad_imputada: nullableNum(row.cantidad_imputada),
        unidad_imputada: nullableStr(row.unidad_imputada),
        confianza: str(row.confianza) as RetiradaFila['confianza'],
        metodo: str(row.metodo) as RetiradaFila['metodo'],
        revision_cerrada: bool(row.revision_cerrada),
      }))
    },
  })
}
