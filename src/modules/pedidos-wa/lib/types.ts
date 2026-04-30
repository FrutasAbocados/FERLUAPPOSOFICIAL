export type Unidad =
  | 'caja' | 'caja_pequena' | 'kg' | 'saco' | 'bolsa'
  | 'manojo' | 'bandeja' | 'lecho' | 'carton' | 'unidad'

export type Repartidor = 'TORRES' | 'GERMAN' | 'RAUL' | 'ALEX'
export type TipoFactura = 'HOLDED' | 'DRIVE' | 'NINGUNA'
export type Salida = 'PRIMERA' | 'SEGUNDA' | null
export type Metodo = 'regex' | 'claude' | 'manual'
export type EstadoPedido = 'pendiente' | 'preparado' | 'entregado' | 'cancelado'

export type ClientePedido = {
  id: string
  nombre: string
  nombre_normalizado: string
  holded_contact_id: string | null
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
  GERMAN: 'Germán',
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
