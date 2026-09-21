export type EstadoBorrador = 'draft' | 'ready' | 'blocked' | 'emitting' | 'cancelled'
export type TipoDocumentoPrevisto = 'factura' | 'albaran'
export type EstadoClienteFiscal = 'incompleto' | 'pendiente_revision' | 'validado' | 'inactivo'

export type RevisionSombraActual = {
  borrador_id: string
  accion: 'cerrado' | 'reabierto'
  secuencia: number
  revision_documento: number
  ocurrido_at: string
  motivo: string | null
  snapshot_sha256: string | null
  vigente: boolean
  motivo_invalidez: string | null
}

export type VerifactuSimulacion = {
  borrador_id: string
  simulacion_id: number
  revision_evento_id: number
  secuencia: number
  numero_simulado: string
  fecha_expedicion: string
  tipo_factura: 'F1'
  cuota_total: number
  importe_total: number
  huella_anterior: string | null
  huella: string
  generado_at: string
  vigente: boolean
}

export type VerifactuXmlSimulacion = {
  borrador_id: string
  xml_simulacion_id: number
  simulacion_id: number
  numero_simulado: string
  xml_sha256: string
  xsd_version: '1.0'
  generado_at: string
  vigente: boolean
}

export type BorradorResumen = {
  borrador_id: string
  numero_interno: number
  revision: number
  estado: EstadoBorrador
  motivo_bloqueo: string | null
  tipo_documento: TipoDocumentoPrevisto
  fecha_operacion: string
  updated_at: string
  cliente_id: string
  cliente_nombre: string
  cliente_comercial: string | null
  cliente_estado: EstadoClienteFiscal
  holded_contact_id: string | null
  pedido_wa_id: string | null
  pedido_fecha: string | null
  pedido_cliente_nombre: string | null
  holded_documento_id: string | null
  holded_documento_numero: string | null
  holded_documento_tipo: string | null
  holded_estado: string | null
  holded_actualizado_at: string | null
  lineas: number
  lineas_pendientes: number
  base_provisional: number
  iva_provisional: number
  recargo_provisional: number
  total_provisional: number
  holded_lineas: number
  holded_subtotal: number | null
  holded_total: number | null
  diferencia_holded: number | null
  revision_sombra: RevisionSombraActual | null
  verifactu_simulacion: VerifactuSimulacion | null
  verifactu_xml: VerifactuXmlSimulacion | null
  traza: TrazaResumen | null
}

// ─── Trazabilidad (T2-T5) ────────────────────────────────────────────────────

/** 'lote_sin_cantidad' = compra y lote identificados, sin cuadrar cantidades. */
export type EstadoTraza = 'sin_traza' | 'parcial' | 'lote_sin_cantidad' | 'completa'
export type ConfianzaTraza = 'alta' | 'media' | 'baja'
export type AlcanceTraza = 'cantidad' | 'lote'

export type TrazaResumen = {
  borrador_id: string
  lineas: number
  completas: number
  solo_lote: number
  parciales: number
  sin_traza: number
  puede_cerrar: boolean
  confianza_peor: ConfianzaTraza | null
}

export type TrazaLineaEstado = {
  borrador_linea_id: string
  borrador_id: string
  descripcion: string
  cantidad: number
  unidad: string
  cantidad_trazada: number
  estado_traza: EstadoTraza
  n_trazas: number
  confianza_peor: ConfianzaTraza | null
}

export type Traza = {
  id: string
  borrador_linea_id: string
  alcance: AlcanceTraza
  cantidad_imputada: number | null
  unidad: string | null
  lote: string | null
  origen: string | null
  proveedor_nombre: string
  num_factura: string | null
  fecha_compra: string
  descripcion_compra: string | null
  confianza: ConfianzaTraza
  metodo: 'auto_fifo' | 'manual'
  compra_id: string | null
  compra_linea_id: string | null
  created_at: string
}

/** Línea de compra ofrecida para asignar un lote a mano. */
export type CompraCandidata = {
  compra_linea_id: string
  compra_id: string
  fecha_compra: string
  proveedor_nombre: string
  num_factura: string | null
  descripcion: string
  lote: string | null
  origen: string | null
  unidad: string
  cantidad: number
  cantidad_disponible: number
}

export type RetiradaFila = {
  traza_id: string
  lote: string | null
  origen: string | null
  proveedor_nombre: string
  num_factura: string | null
  fecha_compra: string
  descripcion_compra: string | null
  cliente_nombre: string
  cliente_comercial: string | null
  numero_interno: number
  fecha_operacion: string
  descripcion_venta: string
  cantidad_vendida: number
  unidad_venta: string
  alcance: AlcanceTraza
  cantidad_imputada: number | null
  unidad_imputada: string | null
  confianza: ConfianzaTraza
  metodo: 'auto_fifo' | 'manual'
  revision_cerrada: boolean
}

export type RetiradaFiltros = {
  lote?: string | null
  numFactura?: string | null
  proveedor?: string | null
  desde?: string | null
  hasta?: string | null
}

export type BorradorLinea = {
  id: string
  borrador_id: string
  pedido_wa_linea_id: string | null
  orden: number
  producto_referencia: string | null
  producto_origen: 'holded_legacy' | 'manual' | 'sin_vincular'
  descripcion: string
  cantidad: number
  unidad: string
  precio_unitario: number | null
  precio_estado: 'pendiente' | 'resuelto' | 'manual' | 'gratis'
  precio_fuente: string | null
  precio_fecha: string | null
  descuento_pct: number
  iva_pct: number
  recargo_equivalencia_pct: number
  regimen_iva: string
  base_provisional: number | null
  cuota_iva_provisional: number | null
  cuota_recargo_provisional: number | null
  total_provisional: number | null
  updated_at: string
}

export type LineaEditable = {
  id: string
  borrador_id: string
  descripcion: string
  cantidad: string
  unidad: string
  precio_unitario: string
  descuento_pct: string
  iva_pct: string
  recargo_equivalencia_pct: string
}

export type HoldedLinea = {
  id: string
  product_id: string | null
  nombre: string
  units: number
  price: number
  subtotal: number
  tax_rate: number
}
