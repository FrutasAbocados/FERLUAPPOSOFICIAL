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

export interface ResumenComparativo {
  ventas: number
  ventas_ant: number
  ventas_delta_pct: number | null
  compras: number
  compras_ant: number
  compras_delta_pct: number | null
  margen: number
  margen_ant: number
  margen_delta_pct: number | null
  pendiente_cobro: number
  docs: number
  cogs: number
  margen_pct: number | null
  comp_from: string | null
  comp_to: string | null
}

export interface ForecastSeriePunto {
  mes: string         // YYYY-MM-DD (primer día del mes)
  ventas: number
  es_proy: boolean
}

export interface Forecast {
  mes_proximo: string         // YYYY-MM-DD
  forecast_next: number
  mes_actual_proy: number
  pct_mes: number
  tendencia_pct: number
  base_meses: number
  meses_serie: ForecastSeriePunto[]
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
  ventas: number             // total con IVA (cuadra con Holded)
  ventas_subtotal: number    // sin IVA
  cogs: number
  margen: number             // ventas_subtotal - cogs
  margen_pct: number | null  // sobre ventas_subtotal
}

export interface TopProductoMargen {
  nombre: string
  product_id: string | null
  unidades: number
  ventas: number             // total con IVA
  ventas_subtotal: number    // sin IVA
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

export interface ClienteListItem {
  contact_name_canon: string
  contact_ids: string[] | null   // todos los IDs Holded unificados bajo este nombre
  docs: number
  ventas: number
  ventas_subtotal: number
  cogs: number
  margen: number
  margen_pct: number | null
  pendiente_cobro: number
  ultima_compra: string | null
  num_aliases: number
}

export interface ClienteFactura {
  id: string
  doc_number: string | null
  subtipo: string | null
  contact_name: string | null
  fecha: string | null
  fecha_vencimiento: string | null
  subtotal: number | null
  total: number | null
  payments_pending: number | null
  status: number | null
}

export interface ClienteProducto {
  nombre: string
  product_id: string | null
  veces: number
  unidades: number
  ventas_subtotal: number
  cogs: number
  margen: number
  margen_pct: number | null
  ultima_compra: string | null
}

export interface AliasRow {
  id: string
  alias_from: string
  alias_to: string
  created_at: string
}

export interface ProductoListItem {
  product_id: string | null
  nombre: string
  veces: number
  unidades: number
  ventas: number
  ventas_subtotal: number
  cogs: number
  margen: number
  margen_pct: number | null
  coste_unidad: number | null
  es_coste_manual: boolean
  ultima_compra: string | null
  ultima_venta: string | null
}

export interface ProductoCliente {
  contact_name_canon: string
  veces: number
  unidades: number
  ventas_subtotal: number
  margen: number
  margen_pct: number | null
  ultima_compra: string | null
}

export interface ProductoCompra {
  fecha: string | null
  contact_id: string | null
  contact_name: string
  units: number | null
  subtotal: number | null
  precio_unit: number | null
}

export interface CosteManualRow {
  product_id: string
  coste_eur: number
  nota: string | null
  updated_at: string
}

export interface FacturaListItem {
  id: string
  tipo: 'VENTA' | 'COMPRA'
  subtipo: string | null
  doc_number: string | null
  contact_id: string | null
  contact_name_raw: string | null
  contact_name_canon: string | null
  fecha: string | null
  fecha_vencimiento: string | null
  subtotal: number | null
  total: number | null
  cogs: number | null
  margen: number | null
  margen_pct: number | null
  payments_pending: number | null
  status: number | null
}

export interface FacturaLinea {
  id: string
  nombre: string
  product_id: string | null
  sku: string | null
  units: number | null
  price: number | null
  discount: number | null
  tax_rate: number | null
  subtotal: number | null
  coste_unidad: number | null
  cogs_linea: number | null
  margen_linea: number | null
}

export interface AbueloFactura {
  id: string
  fecha: string
  numero_factura: string | null
  nota: string | null
  total: number
  num_lineas: number
  created_at: string
}

export interface AbueloLinea {
  id: string
  factura_id: string
  product_id: string | null
  nombre: string
  units: number
  price: number
  subtotal: number
}

export interface CatalogoProducto {
  product_id: string
  nombre: string
  ultimo_precio: number | null
  veces_vendido: number
}
