import type { Unidad } from '../types'
import { PATRON_LINEA, normalizarUnidad, parseCantidad } from './regex'

export type LineaParseadaCore = {
  cantidad: number
  unidad: Unidad
  producto: string
  productoRaw: string
  notas: string | null
  esGratis: boolean
}

export type ResultadoLineaCore =
  | { confianza: 'alta'; linea: LineaParseadaCore }
  | { confianza: 'baja'; razon: string }

export function parsearLineaConRegex(
  rawLinea: string,
  dict: Record<string, string>,
): ResultadoLineaCore {
  const trimmed = rawLinea.trim()
  if (!trimmed) return { confianza: 'baja', razon: 'vacio' }

  const match = trimmed.match(PATRON_LINEA)
  if (!match) return { confianza: 'baja', razon: 'sin_cantidad' }

  const [, cantidadRaw, unidadRaw, restoRaw] = match
  const cantidad = parseCantidad(cantidadRaw)
  if (!Number.isFinite(cantidad)) return { confianza: 'baja', razon: 'cantidad_invalida' }

  const unidad = normalizarUnidad(unidadRaw)
  const restoLimpio = (restoRaw ?? '').trim()
  if (!restoLimpio) return { confianza: 'baja', razon: 'sin_producto' }

  const { producto, notas, esGratis } = resolveProducto(restoLimpio, dict)

  return {
    confianza: 'alta',
    linea: {
      cantidad,
      unidad,
      producto,
      productoRaw: restoLimpio,
      notas,
      esGratis,
    },
  }
}

const RE_GRATIS = /\bgratis\b/gi
const RE_QUALITY = /\b(BUENO|BUENAS|o\s+rosa\??)\b/gi

export function resolveProducto(
  rawInput: string,
  dict: Record<string, string>,
): { producto: string; notas: string | null; esGratis: boolean } {
  let working = rawInput
  let esGratis = false
  const notasArr: string[] = []

  if (RE_GRATIS.test(working)) {
    esGratis = true
    working = working.replace(RE_GRATIS, '').trim()
  }

  const qm = working.match(RE_QUALITY)
  if (qm) {
    notasArr.push(...qm.map(s => s.trim()))
    working = working.replace(RE_QUALITY, '').replace(/\s+/g, ' ').trim()
  }

  const lower = working.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!lower) {
    return {
      producto: capitalize(rawInput.trim()) || rawInput.trim(),
      notas: notasArr.join(', ') || null,
      esGratis,
    }
  }

  if (dict[lower]) {
    return { producto: dict[lower], notas: notasArr.join(', ') || null, esGratis }
  }

  const tokens = lower.split(' ').filter(Boolean)
  for (let len = tokens.length; len >= 1; len--) {
    for (let start = 0; start + len <= tokens.length; start++) {
      const sub = tokens.slice(start, start + len).join(' ')
      if (dict[sub]) {
        return { producto: dict[sub], notas: notasArr.join(', ') || null, esGratis }
      }
    }
  }

  return {
    producto: capitalize(lower),
    notas: notasArr.join(', ') || null,
    esGratis,
  }
}

function capitalize(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}
