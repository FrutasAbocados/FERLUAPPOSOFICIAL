export type Cierre = {
  id: string
  fecha: string

  efectivo: number
  tarjeta: number
  otros_efectivo: number
  otros_tarjeta: number

  compras: number
  vehiculos: number
  otras_compras: number
  otros: number

  deuda_generada: number
  deuda_cobrada: number

  pedidos: number
  clientes_nuevos: number

  caja_fisica: number | null
  observaciones: string | null

  total_cobrado: number
  total_gastos: number
  resultado: number

  created_at: string
  updated_at: string
}

export type CierreInput = {
  fecha: string
  efectivo: number
  tarjeta: number
  otros_efectivo: number
  otros_tarjeta: number
  compras: number
  vehiculos: number
  otras_compras: number
  otros: number
  deuda_generada: number
  deuda_cobrada: number
  pedidos: number
  clientes_nuevos: number
  caja_fisica: number | null
  observaciones: string | null
}

export const NUMERIC_FIELDS: (keyof CierreInput)[] = [
  'efectivo',
  'tarjeta',
  'otros_efectivo',
  'otros_tarjeta',
  'compras',
  'vehiculos',
  'otras_compras',
  'otros',
  'deuda_generada',
  'deuda_cobrada',
  'pedidos',
  'clientes_nuevos',
]

export const emptyInput = (fecha: string): CierreInput => ({
  fecha,
  efectivo: 0,
  tarjeta: 0,
  otros_efectivo: 0,
  otros_tarjeta: 0,
  compras: 0,
  vehiculos: 0,
  otras_compras: 0,
  otros: 0,
  deuda_generada: 0,
  deuda_cobrada: 0,
  pedidos: 0,
  clientes_nuevos: 0,
  caja_fisica: null,
  observaciones: null,
})

export const fromCierre = (c: Cierre): CierreInput => ({
  fecha: c.fecha,
  efectivo: c.efectivo,
  tarjeta: c.tarjeta,
  otros_efectivo: c.otros_efectivo,
  otros_tarjeta: c.otros_tarjeta,
  compras: c.compras,
  vehiculos: c.vehiculos,
  otras_compras: c.otras_compras,
  otros: c.otros,
  deuda_generada: c.deuda_generada,
  deuda_cobrada: c.deuda_cobrada,
  pedidos: c.pedidos,
  clientes_nuevos: c.clientes_nuevos,
  caja_fisica: c.caja_fisica,
  observaciones: c.observaciones,
})
