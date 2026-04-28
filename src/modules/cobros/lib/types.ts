export type FormaPago =
  | 'Contado'
  | '1_dia'
  | '7_dias'
  | '30_dias'
  | 'Semanal_V'
  | 'Mensual_V'

export const FORMA_PAGO_LABEL: Record<FormaPago, string> = {
  Contado: 'Contado',
  '1_dia': '1 día',
  '7_dias': '7 días',
  '30_dias': '30 días',
  Semanal_V: 'Semanal V.',
  Mensual_V: 'Mensual V.',
}

export type MetodoCobro = 'Efectivo' | 'Transferencia' | 'Bizum' | 'Otro'

export type TipoMovimiento = 'Factura' | 'Pizarra'

export type Cliente = {
  id: string
  nombre: string
  forma_pago: FormaPago
  metodo_cobro_preferido: MetodoCobro | null
  notas: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export type Movimiento = {
  id: string
  cliente_id: string
  tipo: TipoMovimiento
  numero_factura: string | null
  fecha_factura: string // YYYY-MM-DD
  importe: number
  pagado: boolean
  fecha_cobro: string | null
  importe_cobrado: number | null
  metodo_cobro: MetodoCobro | null
  fecha_vencimiento: string // YYYY-MM-DD
  concepto: string | null
  created_at: string
  updated_at: string
}

export type Estado = 'Cobrado' | 'Pendiente' | 'Próximo' | 'Vencido'

export type ClienteResumen = Cliente & {
  total_pendiente: number
  total_vencido: number
  total_proximo: number // ≤7 días al vencimiento, no vencido
  total_pizarra: number
  estado: Estado // peor estado de sus movimientos pendientes
  num_pendientes: number
}
