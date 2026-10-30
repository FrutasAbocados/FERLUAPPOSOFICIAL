export type TipoMovimiento = 'entrada' | 'salida'
export type FuenteMovimiento = 'manual' | 'cierre'

export const CATEGORIAS_ENTRADA = ['efectivo_ruta', 'ingreso_banco', 'otros'] as const
export const CATEGORIAS_SALIDA  = ['gasoil', 'propinas', 'material', 'banco', 'otros'] as const

export const CATEGORIA_LABEL: Record<string, string> = {
  efectivo_ruta: 'Efectivo ruta',
  ingreso_banco: 'Ingreso banco',
  gasoil:        'Gasoil',
  propinas:      'Propinas',
  material:      'Material',
  banco:         'Banco',
  otros:         'Otros',
}

export interface Movimiento {
  sobre_id:   string | null
  id:         string
  fecha:      string
  tipo:       TipoMovimiento
  concepto:   string
  importe:    number
  categoria:  string | null
  notas:      string | null
  cierre_id:  string | null
  fuente:     FuenteMovimiento
  ajuste:     boolean
  created_at: string
}

export interface SobreResumen {
  id: string
  nombre: string
  salidas_total: number
  devoluciones_total: number
  acumulado: number
  neto_periodo: number
  movimientos: number
}

export interface TesoreriaKpis {
  saldo_total:      number
  entradas_periodo: number
  salidas_periodo:  number
  count_periodo:    number
}
