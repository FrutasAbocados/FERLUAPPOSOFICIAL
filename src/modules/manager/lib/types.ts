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

export interface KpiMes {
  ventas_n: number
  ventas_subtotal: number
  ventas_total: number
  ventas_pendiente: number
  compras_n: number
  compras_subtotal: number
  compras_total: number
  margen: number
}

export interface TopContacto {
  contact_name: string
  n: number
  subtotal: number
}
