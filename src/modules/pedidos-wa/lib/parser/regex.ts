import type { Unidad } from '../types'

// La unidad solo se reconoce cuando va seguida de espacio o fin de línea — así
// "8 cebollas" no matchea "c" como unidad caja y deja el producto intacto.
export const PATRON_LINEA =
  /^(\d+(?:[,.]\d+)?(?:\/\d+)?)\s*((?:c|caja|cajas|peti|petis|kg|saco|sacos|bolsa|bolsas|manojo|manojos|bandeja|bandejas|lecho|lechos|carton|cartones|cart[oó]n|unidad|unidades|u)(?=\s|$))?\s*(.+)$/i

export const PATRON_SUBSECCION = /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+?):\s*(.*)$/

export const NOTAS_ADMIN: RegExp[] = [
  /^COBRAR\s+FACT(?:URA)?\s+ANTERIOR/i,
  /^HABLAR\s+CON\s+\w+(?:\s+PARA\s+COBRAR)?/i,
]

// "/" solo separa líneas si NO está entre dos dígitos — preservamos "1/2 c X".
export const SEPARADORES = /\s*(?<!\d)[/;](?!\d)\s*/

const UNIDAD_NORMALIZACION: Record<string, Unidad> = {
  c:         'caja',
  caja:      'caja',
  cajas:     'caja',
  peti:      'caja_pequena',
  petis:     'caja_pequena',
  kg:        'kg',
  saco:      'saco',
  sacos:     'saco',
  bolsa:     'bolsa',
  bolsas:    'bolsa',
  manojo:    'manojo',
  manojos:   'manojo',
  bandeja:   'bandeja',
  bandejas:  'bandeja',
  lecho:     'lecho',
  lechos:    'lecho',
  carton:    'carton',
  cartón:    'carton',
  cartones:  'carton',
  unidad:    'unidad',
  unidades:  'unidad',
  u:         'unidad',
}

export function normalizarUnidad(raw: string | null | undefined): Unidad {
  if (!raw) return 'unidad'
  return UNIDAD_NORMALIZACION[raw.toLowerCase()] ?? 'unidad'
}

export function parseCantidad(raw: string): number {
  if (raw.includes('/')) {
    const [num, den] = raw.split('/').map(s => parseFloat(s.replace(',', '.')))
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return num / den
    return NaN
  }
  return parseFloat(raw.replace(',', '.'))
}
