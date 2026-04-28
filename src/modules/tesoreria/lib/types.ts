export type CuentaTipo = 'corriente' | 'efectivo' | 'credito'
export type PagoEstado = 'pendiente' | 'pagado' | 'cancelado'

export type Cuenta = {
  id: string
  nombre: string
  tipo: CuentaTipo
  saldo_inicial: number
  limite_credito: number | null
  activo: boolean
  orden: number
  notas: string | null
  created_at: string
  updated_at: string
}

export type CuentaConSaldo = Cuenta & {
  saldo_actual: number
}

export type Movimiento = {
  id: string
  cuenta_id: string
  fecha: string
  importe: number
  concepto: string
  categoria: string | null
  created_at: string
  updated_at: string
}

export type Pago = {
  id: string
  cuenta_id: string | null
  proveedor: string
  concepto: string | null
  importe: number
  fecha_vencimiento: string
  estado: PagoEstado
  fecha_pago: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export type GastoFijo = {
  id: string
  concepto: string
  importe: number
  dia_mes: number
  cuenta_id: string | null
  activo: boolean
  notas: string | null
  created_at: string
  updated_at: string
}

export type CuentaInput = {
  nombre: string
  tipo: CuentaTipo
  saldo_inicial: number
  limite_credito: number | null
  notas: string | null
}

export type MovimientoInput = {
  cuenta_id: string
  fecha: string
  importe: number
  concepto: string
  categoria: string | null
}

export type PagoInput = {
  cuenta_id: string | null
  proveedor: string
  concepto: string | null
  importe: number
  fecha_vencimiento: string
  notas: string | null
}

export const CUENTA_TIPO_LABEL: Record<CuentaTipo, string> = {
  corriente: 'Cuenta corriente',
  efectivo: 'Efectivo',
  credito: 'Línea de crédito',
}
