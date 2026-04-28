export type Tipo = 'VENTA' | 'COMPRA'

export interface ManagerFactura {
  id: string
  tipo: Tipo
  doc_number: string | null
  contact_id: string | null
  contact_name: string | null
  fecha: string | null
  fecha_vencimiento: string | null
  subtotal: number | null
  impuestos: number | null
  total: number | null
  status: number | null
  payments_total: number | null
  payments_pending: number | null
}

export interface SyncLog {
  id: number
  trigger: 'manual' | 'cron' | 'backfill'
  range_start: string | null
  range_end: string | null
  started_at: string
  finished_at: string | null
  ventas_upserted: number | null
  compras_upserted: number | null
  contactos_upserted: number | null
  lineas_upserted: number | null
  ok: boolean | null
  error: string | null
}

// Devuelto por RPC manager_resumen_periodo.
export interface ResumenPeriodo {
  ventas_n: number
  ventas_subtotal: number
  ventas_total: number
  pendiente_cobro: number
  compras_n: number
  compras_subtotal: number
  compras_total: number
  cogs: number
  ventas_lineas: number
  margen_real: number
  margen_pct: number | null
}

export interface TopClienteMargen {
  contact_name_canon: string
  docs: number
  unidades: number
  ventas: number
  cogs: number
  margen: number
  margen_pct: number | null
}

export interface TopProductoMargen {
  nombre: string
  product_id: string | null
  unidades: number
  ventas: number
  cogs: number
  margen: number
  margen_pct: number | null
}

export interface SerieDiariaPunto {
  fecha: string  // YYYY-MM-DD
  ventas: number
  compras: number
  margen: number
}
