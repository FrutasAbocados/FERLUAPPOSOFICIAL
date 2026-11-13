// ── Dictado → líneas ─────────────────────────────────────────────────────────

const NUMEROS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30,
  cuarenta: 40, cincuenta: 50, cien: 100, medio: 0.5, media: 0.5, cuarto: 0.25,
}

export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ,. ]/g, ' ').replace(/\s+/g, ' ').trim()

const NUM = String.raw`(\d+(?:[.,]\d+)?|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|cien|medio|media|cuarto)`
const UNIDAD = String.raw`(kilos?|kg|k|quilos?|gramos?|gr|g)`
const FORMATO = String.raw`(manojos?|bolsas?|cajas?|unidades|unidad|uds?|piezas?)`
const FORMATO_RE = new RegExp(String.raw`\b${NUM}\s+${FORMATO}\b`, 'i')

/** Formatos de merma: el peso en kg o un recuento por envase. */
export const MERMA_UNIDADES = ['kg', 'unidad', 'manojo', 'bolsa', 'caja'] as const
export type MermaUnidad = (typeof MERMA_UNIDADES)[number]

const ETIQUETA: Record<MermaUnidad, [string, string]> = {
  kg: ['kg', 'kg'],
  unidad: ['ud', 'uds'],
  manojo: ['manojo', 'manojos'],
  bolsa: ['bolsa', 'bolsas'],
  caja: ['caja', 'cajas'],
}

export const nombreUnidad = (u: MermaUnidad, plural = false): string => ETIQUETA[u][plural ? 1 : 0]

/** "0,5 kg", "1 manojo", "3 bolsas". */
export const cantidadTexto = (n: number, u: MermaUnidad): string => {
  const num = (Math.round(n * 1000) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 3 })
  return `${num} ${nombreUnidad(u, u !== 'kg' && n !== 1)}`
}

/** Totales por formato, kg primero: "4,6 kg · 3 manojos · 1 bolsa". */
export const resumenCantidades = (rows: { peso_kg: number; unidad: MermaUnidad }[]): string => {
  const m = new Map<MermaUnidad, number>()
  for (const r of rows) m.set(r.unidad, (m.get(r.unidad) ?? 0) + r.peso_kg)
  if (!m.size) return cantidadTexto(0, 'kg')
  return MERMA_UNIDADES.filter(u => m.has(u)).map(u => cantidadTexto(m.get(u) ?? 0, u)).join(' · ')
}

const aUnidad = (tok: string): MermaUnidad => {
  const t = tok.toLowerCase()
  if (t.startsWith('manojo')) return 'manojo'
  if (t.startsWith('bolsa')) return 'bolsa'
  if (t.startsWith('caja')) return 'caja'
  return 'unidad'
}
// "2,5 kilos", "dos kilos y medio", "medio kilo", "500 gramos"
const PESO_RE = new RegExp(String.raw`\b${NUM}\s*(?:${UNIDAD})\b(?:\s+y\s+(medio|cuarto))?|\b${NUM}\s+y\s+(medio)\s+(?:${UNIDAD})\b`, 'i')

const aNumero = (tok: string): number => {
  const t = tok.toLowerCase()
  if (t in NUMEROS) return NUMEROS[t]
  return Number(t.replace(',', '.'))
}

export interface MermaLineaDictada {
  referencia: string
  texto: string
  peso_kg: number | null
  unidad: MermaUnidad
}

/** Mejor coincidencia en el catálogo por tokens; null si no hay una clara. */
export function emparejarReferencia(texto: string, catalogo: string[]): string | null {
  const tokens = normalizar(texto).split(' ').filter(t => t.length > 2 && !['de', 'del', 'los', 'las', 'kilo', 'kilos'].includes(t))
  if (!tokens.length) return null
  let mejor: { ref: string; score: number; len: number } | null = null
  for (const ref of catalogo) {
    const refTokens = normalizar(ref).split(' ')
    const hits = tokens.filter(t => refTokens.some(r => r === t || r.startsWith(t) || t.startsWith(r) && r.length > 3)).length
    const score = hits / tokens.length
    if (score > 0 && (!mejor || score > mejor.score || (score === mejor.score && refTokens.length < mejor.len))) {
      mejor = { ref, score, len: refTokens.length }
    }
  }
  return mejor && mejor.score >= 0.5 ? mejor.ref : null
}

/**
 * Convierte un dictado tipo "tomate pera 2,5 kilos, dos kilos de plátano y medio kilo de ajo"
 * en líneas referencia + peso. Lo que no se entiende queda con peso null para corregir a mano.
 */
export function parsearDictadoMerma(dictado: string, catalogo: string[]): MermaLineaDictada[] {
  const trozos = dictado
    .replace(/\s+(?:luego|después|despues|también|tambien|otra|otro)\s+/gi, ', ')
    .split(/(?<!\d),(?!\d)|,\s+|[;\n]+|\.\s+|\s+y\s+(?=(?:\d+(?:[.,]\d+)?|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b)|\s+y\s+(?=medi[oa]\s+(?:kilos?|kg|k|quilos?)\b)|(?<=\b(?:kilos?|kg|quilos?|gramos?|gr|medio|cuarto|manojos?|bolsas?|cajas?|unidades|unidad|piezas?))\s+y\s+(?!medi[oa]\b|cuarto\b)/i)
    .map(t => t.trim())
    .filter(Boolean)

  const lineas: MermaLineaDictada[] = []
  for (const trozo of trozos) {
    const t0 = trozo.replace(/(^|\S+\s+)(kilo|quilo)(?=\s|$)/i, (_a, prev: string, u: string) => {
      const anterior = prev.trim().toLowerCase()
      const esNumero = anterior !== '' && (anterior in NUMEROS || /^\d+(?:[.,]\d+)?$/.test(anterior))
      return esNumero ? `${prev}${u}` : `${prev}1 ${u}`
    })
    const f = trozo.match(FORMATO_RE)
    const m = f ? null : t0.match(PESO_RE)
    let peso: number | null = null
    let unidad: MermaUnidad = 'kg'
    let resto = trozo
    if (f) {
      peso = aNumero(f[1])
      unidad = aUnidad(f[2])
      resto = (trozo.slice(0, f.index) + ' ' + trozo.slice((f.index ?? 0) + f[0].length)).trim()
    } else if (m) {
      if (m[1]) {
        peso = aNumero(m[1])
        if (m[3]) peso += NUMEROS[m[3].toLowerCase()]
        if (/^(gramos?|gr|g)$/i.test(m[2] ?? '')) peso /= 1000
      } else if (m[4]) {
        peso = aNumero(m[4]) + 0.5
        if (/^(gramos?|gr|g)$/i.test(m[6] ?? '')) peso /= 1000
      }
      resto = (t0.slice(0, m.index) + ' ' + t0.slice((m.index ?? 0) + m[0].length)).trim()
    } else {
      // Sin unidad: un número al final o al principio se entiende como kilos ("plátano 2,5").
      const suelto = trozo.match(new RegExp(String.raw`^(.*\S)\s+${NUM}$|^${NUM}\s+(.+)$`, 'i'))
      if (suelto) {
        peso = aNumero(suelto[2] ?? suelto[3])
        resto = (suelto[1] ?? suelto[4]).trim()
      }
    }
    resto = resto.replace(/\s+/g, ' ').replace(/^(?:de|del|y)\s+/i, '').replace(/\s+(?:de|del)$/i, '').trim()
    if (!resto && peso === null) continue
    if (!resto && lineas.length && lineas[lineas.length - 1].peso_kg === null) {
      lineas[lineas.length - 1].peso_kg = peso
      continue
    }
    const ref = emparejarReferencia(resto, catalogo)
    lineas.push({
      referencia: ref ?? resto.toUpperCase(),
      texto: trozo,
      peso_kg: peso !== null && Number.isFinite(peso) && peso > 0 ? Math.round(peso * 1000) / 1000 : null,
      unidad,
    })
  }
  return lineas
}
