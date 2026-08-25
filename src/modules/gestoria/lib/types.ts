export type GestoriaTipo = 'AMBAS' | 'COMPRA' | 'VENTA'
export type GestoriaNivel = 'documentos' | 'lineas'

export type GestoriaFiltros = {
  desde: string
  hasta: string
  tipo: GestoriaTipo
  nivel: GestoriaNivel
}

export type GestoriaFila = {
  tipo: string
  subtipo: string
  fecha: string
  numero: string
  tercero: string
  base_imponible: number | null
  iva: number | null
  total: number | null
  pendiente: number | null
  descripcion: string
  sku: string
  cantidad: number | null
  precio_unitario: number | null
  iva_pct: number | null
  importe: number | null
  total_documento: number | null
  pdf_path: string | null
  foto_paths: string[]
}

export type GestoriaColumnKind = 'text' | 'date' | 'number' | 'money' | 'percent'

export type GestoriaColumn = {
  key: keyof GestoriaFila
  label: string
  kind: GestoriaColumnKind
  width: number
}

export const DOCUMENT_COLUMNS: GestoriaColumn[] = [
  { key: 'tipo', label: 'Tipo', kind: 'text', width: 10 },
  { key: 'subtipo', label: 'Documento', kind: 'text', width: 12 },
  { key: 'fecha', label: 'Fecha', kind: 'date', width: 12 },
  { key: 'numero', label: 'Número', kind: 'text', width: 15 },
  { key: 'tercero', label: 'Cliente / proveedor', kind: 'text', width: 25 },
  { key: 'base_imponible', label: 'Base imponible', kind: 'money', width: 14 },
  { key: 'iva', label: 'IVA', kind: 'money', width: 12 },
  { key: 'total', label: 'Total', kind: 'money', width: 14 },
  { key: 'pendiente', label: 'Pendiente', kind: 'money', width: 14 },
]

export const LINE_COLUMNS: GestoriaColumn[] = [
  { key: 'tipo', label: 'Tipo', kind: 'text', width: 10 },
  { key: 'subtipo', label: 'Documento', kind: 'text', width: 12 },
  { key: 'fecha', label: 'Fecha', kind: 'date', width: 12 },
  { key: 'numero', label: 'Número', kind: 'text', width: 15 },
  { key: 'tercero', label: 'Cliente / proveedor', kind: 'text', width: 24 },
  { key: 'descripcion', label: 'Concepto', kind: 'text', width: 28 },
  { key: 'sku', label: 'SKU', kind: 'text', width: 13 },
  { key: 'cantidad', label: 'Cantidad', kind: 'number', width: 11 },
  { key: 'precio_unitario', label: 'Precio unitario', kind: 'money', width: 14 },
  { key: 'iva_pct', label: 'IVA %', kind: 'percent', width: 10 },
  { key: 'importe', label: 'Importe línea', kind: 'money', width: 14 },
  { key: 'total_documento', label: 'Total documento', kind: 'money', width: 15 },
]

export function columnsForLevel(nivel: GestoriaNivel): GestoriaColumn[] {
  return nivel === 'documentos' ? DOCUMENT_COLUMNS : LINE_COLUMNS
}
