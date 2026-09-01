/**
 * Motor de "Limpiar pedido para Excel".
 *
 * Texto bruto (WhatsApp, Excel, Markdown, notas sueltas) → lista de compra
 * normalizada, unificada y ordenada. Cero dependencias de React, Supabase o
 * DOM: se puede ejecutar y testear en Node (`pnpm test:unit`).
 *
 * Pipeline:
 *   parseRawOrder → aggregateProducts → formatForExcel / formatForList
 *
 * Principio rector: no inventar. Ante la duda se conserva la información y se
 * marca para revisión, nunca se descarta en silencio.
 */

import {
  DEFAULT_UNITS,
  NOTAS_OPERATIVAS,
  PRODUCT_ALIASES,
  UNIDAD_ALIASES,
  UNIDAD_LABEL,
  type UnidadLimpia,
} from './diccionario.ts'

export type { UnidadLimpia }

export type LineaLimpia = {
  producto: string
  cantidad: number
  unidad: UnidadLimpia
  /** true cuando el parser tuvo que suponer algo y conviene que Luis lo mire. */
  revisar: boolean
  /** Texto original del que salió la línea, para poder auditarla. */
  origen: string
}

export type ResultadoLimpieza = {
  lineas: LineaLimpia[]
  /** Frases apartadas por ser notas operativas, no productos. */
  notas: string[]
  /** Trozos con contenido que el parser no supo convertir en producto. */
  noReconocidos: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de texto
// ─────────────────────────────────────────────────────────────────────────────

/** Minúsculas, sin acentos, espacios colapsados. Base de toda comparación. */
export function clave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function capitalizar(texto: string): string {
  if (!texto) return ''
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Troceado del texto bruto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Separadores de producto. "/" sólo corta si NO está entre dígitos, para no
 * romper fracciones tipo "1/2 c naranja". Igual que en el parser de pedidos.
 */
const SEPARADORES = /\s*(?:(?<!\d)\/(?!\d)|[;|]|<br\s*\/?>)\s*|\t+|\s{3,}/i

/** Sobra de tablas Markdown: filas "|---|---|" y celdas vacías o de guiones. */
const RELLENO_TABLA = /^[\s\-:|_=]*$/

/** Encabezados de tabla que no son producto. */
const ENCABEZADO = /^(producto|cantidad|articulo|artículo|formato|unidad|ud|cant)\.?$/i

function trocear(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .flatMap(linea => linea.split(SEPARADORES))
    .map(t => t.trim().replace(/^[-*•·]\s*/, '').replace(/[.,;:]+$/, '').trim())
    .filter(t => t.length > 0 && !RELLENO_TABLA.test(t) && !ENCABEZADO.test(t))
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalización de unidad y producto
// ─────────────────────────────────────────────────────────────────────────────

/** Texto de unidad → unidad canónica. Devuelve null si no se reconoce. */
export function normalizeUnit(raw: string | null | undefined): UnidadLimpia | null {
  if (!raw) return null
  return UNIDAD_ALIASES[clave(raw)] ?? null
}

/**
 * Texto de producto → nombre final.
 *
 * 1. Alias exacto.
 * 2. Alias sobre la ventana de palabras más larga que exista en el diccionario
 *    (así "1 c pim rojo bueno" sigue resolviendo "Pimiento rojo").
 * 3. Si no hay alias, se respeta lo escrito y sólo se capitaliza.
 *
 * `enDiccionario` distingue el caso 3 para poder marcarlo en la UI.
 */
export function normalizeProduct(raw: string): { producto: string; enDiccionario: boolean } {
  const k = clave(raw)
  if (!k) return { producto: '', enDiccionario: false }
  // Igual que `clave` pero conservando acentos: es lo que se muestra cuando el
  // producto no está en el diccionario ("producto extraño" → "Producto extraño").
  const literal = raw.toLowerCase().replace(/\s+/g, ' ').trim()

  const exacto = PRODUCT_ALIASES[k]
  if (exacto) return { producto: exacto, enDiccionario: true }

  const palabras = k.split(' ').filter(Boolean)
  for (let largo = palabras.length; largo >= 1; largo--) {
    for (let ini = 0; ini + largo <= palabras.length; ini++) {
      const ventana = palabras.slice(ini, ini + largo).join(' ')
      const hit = PRODUCT_ALIASES[ventana]
      if (hit) return { producto: hit, enDiccionario: true }
    }
  }

  return { producto: capitalizar(literal), enDiccionario: false }
}

/** Formato habitual de un producto cuando el pedido no escribe unidad. */
export function unidadPorDefecto(producto: string): UnidadLimpia {
  return DEFAULT_UNITS[clave(producto)] ?? 'unidad'
}

// ─────────────────────────────────────────────────────────────────────────────
// Notas operativas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quita las frases operativas de un trozo de texto.
 *
 * Devuelve el resto y si había nota. El criterio de rescate está en
 * `parseRawOrder`: sólo se conserva el resto cuando queda UNA línea limpia de
 * producto. "3 SANDIAS Y 3 MELON REGALO" no se convierte en dos productos —
 * eso sería inventar cantidades a partir de una nota.
 */
function quitarNotas(token: string): { resto: string; eraNota: boolean } {
  let resto = token
  let eraNota = false
  for (const re of NOTAS_OPERATIVAS) {
    const antes = resto
    resto = resto.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), ' ')
    if (resto !== antes) eraNota = true
  }
  return { resto: resto.replace(/\s+/g, ' ').trim(), eraNota }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parseo de una línea
// ─────────────────────────────────────────────────────────────────────────────

const UNIDADES_ALTERNATIVA = Object.keys(UNIDAD_ALIASES)
  .sort((a, b) => b.length - a.length)
  .join('|')

/**
 * "<cantidad> [unidad] <producto>".
 *
 * La unidad exige espacio o fin de línea detrás: así "1 cebollino" no lee "c"
 * como caja y "1 uva" no lee "u" como unidad.
 */
const PATRON_LINEA = new RegExp(
  `^(\\d+(?:[,.]\\d+)?(?:\\/\\d+)?)\\s*(?:(${UNIDADES_ALTERNATIVA})(?=\\s|$))?\\s*(.*)$`,
  'i',
)

/** Cuenta grupos numéricos: más de uno delata un texto que no es una línea. */
const GRUPOS_NUMERICOS = /\d+(?:[,.]\d+)?/g

function parseCantidad(raw: string): number {
  if (raw.includes('/')) {
    const [num, den] = raw.split('/').map(s => Number.parseFloat(s.replace(',', '.')))
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return num / den
    return Number.NaN
  }
  return Number.parseFloat(raw.replace(',', '.'))
}

function parseToken(token: string): LineaLimpia | null {
  const m = token.match(PATRON_LINEA)
  if (!m) return null

  const [, cantidadRaw, unidadRaw, restoRaw] = m
  const cantidad = parseCantidad(cantidadRaw)
  if (!Number.isFinite(cantidad) || cantidad <= 0) return null

  const resto = (restoRaw ?? '').trim()
  if (!resto) return null

  const { producto, enDiccionario } = normalizeProduct(resto)
  if (!producto) return null

  const unidadExplicita = normalizeUnit(unidadRaw)
  return {
    producto,
    cantidad,
    // Una unidad escrita manda siempre sobre el formato habitual.
    unidad: unidadExplicita ?? unidadPorDefecto(producto),
    revisar: !enDiccionario && !unidadExplicita,
    origen: token,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/** Texto bruto → líneas sueltas, sin unificar ni ordenar. */
export function parseRawOrder(texto: string): ResultadoLimpieza {
  const lineas: LineaLimpia[] = []
  const notas: string[] = []
  const noReconocidos: string[] = []

  for (const token of trocear(texto)) {
    const { resto, eraNota } = quitarNotas(token)

    if (eraNota) {
      notas.push(token)
      // Rescate conservador: sólo si lo que queda es una línea de producto
      // inequívoca (un único grupo numérico al principio).
      if (resto && (resto.match(GRUPOS_NUMERICOS) ?? []).length === 1 && /^\d/.test(resto)) {
        const linea = parseToken(resto)
        if (linea) lineas.push({ ...linea, origen: token, revisar: true })
      }
      continue
    }

    const linea = parseToken(token)
    if (linea) {
      lineas.push(linea)
    } else {
      noReconocidos.push(token)
    }
  }

  return { lineas, notas, noReconocidos }
}

/**
 * Unifica productos repetidos y ordena alfabéticamente.
 *
 * Sólo se suman líneas con el MISMO producto y la MISMA unidad. Cajas y
 * unidades nunca se convierten entre sí: "2 c melón" y "3 melón" salen como
 * dos filas.
 */
export function aggregateProducts(lineas: LineaLimpia[]): LineaLimpia[] {
  const mapa = new Map<string, LineaLimpia>()

  for (const linea of lineas) {
    const k = `${clave(linea.producto)}||${linea.unidad}`
    const previa = mapa.get(k)
    if (previa) {
      previa.cantidad += linea.cantidad
      previa.revisar = previa.revisar || linea.revisar
      previa.origen = `${previa.origen} · ${linea.origen}`
    } else {
      mapa.set(k, { ...linea })
    }
  }

  // Orden alfabético ignorando tildes y mayúsculas; la unidad desempata para
  // que un producto con dos formatos salga siempre en el mismo orden.
  return [...mapa.values()].sort((a, b) => {
    const ka = clave(a.producto)
    const kb = clave(b.producto)
    if (ka !== kb) return ka < kb ? -1 : 1
    return a.unidad < b.unidad ? -1 : a.unidad > b.unidad ? 1 : 0
  })
}

/** Número tal cual lo escribe Luis: entero limpio, decimal con coma. */
export function formatCantidadNumero(cantidad: number): string {
  if (Number.isInteger(cantidad)) return String(cantidad)
  return cantidad.toFixed(2).replace(/0+$/, '').replace(/[.,]$/, '').replace('.', ',')
}

/** "13 unidades", "1 caja", "1,5 kg". */
export function formatCantidad(cantidad: number, unidad: UnidadLimpia): string {
  const label = UNIDAD_LABEL[unidad]
  return `${formatCantidadNumero(cantidad)} ${cantidad === 1 ? label.uno : label.varios}`
}

/** Atajo del pipeline completo: pegar → procesar. */
export function procesarPedido(texto: string): ResultadoLimpieza {
  const r = parseRawOrder(texto)
  return { ...r, lineas: aggregateProducts(r.lineas) }
}

/** TSV para pegar en Excel: columna A producto, columna B cantidad. */
export function formatForExcel(lineas: LineaLimpia[], incluirEncabezados = false): string {
  const filas = lineas.map(l => `${l.producto}\t${formatCantidad(l.cantidad, l.unidad)}`)
  return (incluirEncabezados ? ['Producto\tCantidad', ...filas] : filas).join('\n')
}

/** Una sola columna: "Aguacate - 10 cajas". */
export function formatForList(lineas: LineaLimpia[]): string {
  return lineas.map(l => `${l.producto} - ${formatCantidad(l.cantidad, l.unidad)}`).join('\n')
}
