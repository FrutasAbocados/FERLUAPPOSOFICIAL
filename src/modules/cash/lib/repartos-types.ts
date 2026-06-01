export type FormaPago = 'efectivo' | 'tarjeta' | 'deuda'

export type Jornada = {
  id: string
  fecha: string
  empleado_id: string
  hora_inicio: string | null
  hora_fin: string | null
  notas: string | null
  origen: 'admin' | 'empleado'
  enviado_at: string | null
  revisado: boolean
  revisado_at: string | null
  efectivo_billetes: number | null
  efectivo_monedas: number | null
  created_at: string
  updated_at: string
}

export type GastoTipo = 'compras' | 'gasolina' | 'incidencia'

export type JornadaGasto = {
  id: string
  jornada_id: string
  tipo: GastoTipo
  concepto: string
  importe: number
  orden: number
  gasto_variable_id: string | null
  created_at: string
}

export type GastoInput = {
  tipo: GastoTipo
  concepto: string
  importe: number
  orden: number
}

export type JornadaLinea = {
  id: string
  jornada_id: string
  contact_id: string | null
  contact_nombre: string
  importe: number
  forma_pago: FormaPago
  orden: number
  created_at: string
}

export type LineaInput = {
  contact_id: string | null
  contact_nombre: string
  importe: number
  forma_pago: FormaPago
  orden: number
}

export type JornadaResumen = {
  jornada: Jornada
  empleado_nombre: string
  num_lineas: number
  importe_total: number
  importe_efectivo: number
  importe_tarjeta: number
  importe_deuda: number
}

export type EmpleadoOpt = {
  id: string
  nombre: string
}

export type ContactoOpt = {
  id: string
  nombre: string
}
