export type Unidad =
  | 'caja' | 'caja_pequena' | 'kg' | 'saco' | 'bolsa'
  | 'manojo' | 'bandeja' | 'lecho' | 'carton' | 'unidad'

export type Repartidor = 'TORRES' | 'GERMAN' | 'RAUL' | 'ALEX'
export type TipoFactura = 'HOLDED' | 'DRIVE' | 'NINGUNA'
export type TipoDocHolded = 'invoice' | 'waybill'
export type Salida = 'PRIMERA' | 'SEGUNDA' | null
export type Metodo = 'regex' | 'claude' | 'manual'
export type EstadoPedido = 'pendiente' | 'confirmado' | 'preparado' | 'entregado' | 'cancelado'

export type ClientePedido = {
  id: string
  nombre: string
  nombre_normalizado: string
  holded_contact_id: string | null
  holded_doc_type: TipoDocHolded | null
  repartidor: Repartidor
  horario: string | null
  tipo_factura: TipoFactura
  salida: Salida
  subseccion_default: string | null
  notas: string | null
  activo: boolean
}

export type LineaParseada = {
  orden: number
  cantidad: number
  unidad: Unidad
  producto: string
  productoRaw: string
  subseccion: string | null
  notas: string | null
  esGratis: boolean
  metodo: Metodo
}

export type ResultadoParser = {
  notasAdmin: string | null
  lineas: LineaParseada[]
  textoOriginal: string
}

export type LineaPedidoDB = {
  id: string
  pedido_id: string
  orden: number
  cantidad: number
  unidad: Unidad
  producto_normalizado: string
  producto_raw: string
  subseccion: string | null
  notas: string | null
  es_gratis: boolean
  metodo: Metodo
  created_at: string
}

export type Pedido = {
  id: string
  cliente_id: string
  fecha: string
  texto_original: string
  notas_admin: string | null
  faltas: string | null
  estado: EstadoPedido
  /** Si está set, este pedido va con otro repartidor sólo hoy (no toca al cliente). */
  override_repartidor: Repartidor | null
  /** Si está set, sustituye `cliente.horario` sólo para este pedido. */
  override_horario: string | null
  /** Si está set, sustituye `cliente.salida` sólo para este pedido. */
  override_salida: 'PRIMERA' | 'SEGUNDA' | null
  /** Orden manual dentro del repartidor (1..N). NULL = ordenar por salida+horario. */
  override_orden: number | null
  /** Set tras subir el pedido a Holded (factura o albarán). NULL = sin subir. */
  holded_invoice_id: string | null
  holded_invoice_num: string | null
  holded_invoice_doc_type: TipoDocHolded | null
  holded_invoice_created_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  lineas?: LineaPedidoDB[]
  cliente?: ClientePedido
}

export type Abreviatura = {
  id: string
  abreviatura: string
  producto_normalizado: string
  creada_por_user: boolean
  created_at: string
}

// ─── Compras a proveedores ───────────────────────────────────────────────────

export type ProveedorDetectado = 'alcalde' | 'abasthosur' | 'agroejido' | 'otro'

export type CompraLineaExtraida = {
  orden: number
  codigo_proveedor: string | null
  descripcion: string
  cantidad: number
  unidad: string
  precio_unitario: number
  iva_pct: number
  importe: number
  notas: string | null
}

export type CompraExtraccion = {
  proveedor_detectado: ProveedorDetectado
  proveedor_nombre: string
  num_factura: string
  fecha: string
  total_bruto: number
  total_iva: number
  total: number
  iva_desglose: { base: number; tipo: number; importe: number }[]
  lineas: CompraLineaExtraida[]
  /** Solo en fotos: "FOTO ILEGIBLE: ..." o "FALTAN PAGINAS". */
  notas_globales?: string | null
}

export type OrigenCompra = 'pdf' | 'foto'

export type CompraDB = {
  id: string
  /** NULL = proveedor en texto libre: la compra NO se puede subir a Holded ni entra en el coste. */
  proveedor_holded_id: string | null
  proveedor_nombre: string
  num_factura: string
  fecha: string
  total_bruto: number
  total_iva: number
  total: number
  iva_desglose: { base: number; tipo: number; importe: number }[] | null
  pdf_filename: string | null
  notas: string | null
  origen: OrigenCompra
  foto_paths: string[]
  holded_purchase_id: string | null
  holded_purchase_num: string | null
  holded_purchase_created_at: string | null
  created_at: string
  updated_at: string
}

/** Contacto de Holded cacheado en local (tabla `manager_contactos`). */
export type ContactoHolded = {
  id: string
  nombre: string
  nif: string | null
}

export type CompraLineaDB = {
  id: string
  compra_id: string
  orden: number
  codigo_proveedor: string | null
  descripcion: string
  cantidad: number
  unidad: string
  precio_unitario: number
  iva_pct: number
  importe: number
  notas: string | null
}

// Mapeo proveedor_detectado → holded_contact_id (manager_contactos.id)
export const PROVEEDOR_HOLDED_ID: Record<Exclude<ProveedorDetectado, 'otro'>, string> = {
  alcalde:    '6923e68c528c6c69df09b578',
  abasthosur: '6980edf440e80f35360b88ed',
  agroejido:  '6995d3740c1522995e0b7ee6', // AGROEJIDO SOCIEDAD ANONIMA (CIF A-04007530)
}

export const UNIDAD_LABEL: Record<Unidad, string> = {
  caja:         'caja',
  caja_pequena: 'peti',
  kg:           'kg',
  saco:         'saco',
  bolsa:        'bolsa',
  manojo:       'manojo',
  bandeja:      'bandeja',
  lecho:        'lecho',
  carton:       'cartón',
  unidad:       'ud',
}

export const REPARTIDOR_LABEL: Record<Repartidor, string> = {
  TORRES: 'Torres',
  GERMAN: 'Alvaro Gómez',
  RAUL:   'Raúl',
  ALEX:   'Alex',
}

// Identificación por barra lateral gruesa de color saturado SOBRE fondo neutro
// de la app. Así respetamos el contraste de texto que da el tema (claro u
// oscuro) y solo usamos color para diferenciar repartidor.
export const REPARTIDOR_COLOR: Record<Repartidor, string> = {
  TORRES: 'border-l-4 border-l-blue-500    border-y border-r border-[var(--color-border)] bg-[var(--color-surface)]',
  GERMAN: 'border-l-4 border-l-emerald-500 border-y border-r border-[var(--color-border)] bg-[var(--color-surface)]',
  RAUL:   'border-l-4 border-l-orange-500  border-y border-r border-[var(--color-border)] bg-[var(--color-surface)]',
  ALEX:   'border-l-4 border-l-violet-500  border-y border-r border-[var(--color-border)] bg-[var(--color-surface)]',
}
