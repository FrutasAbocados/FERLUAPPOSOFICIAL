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
