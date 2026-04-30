import { NOTAS_ADMIN, PATRON_SUBSECCION, SEPARADORES } from './regex'

export type Seccion = { nombre: string | null; lineas: string[] }
export type Preprocesado = { notasAdmin: string | null; secciones: Seccion[] }

export function preprocesar(texto: string): Preprocesado {
  const lineasInput = texto.split(/\r?\n/)
  const notasAdminArr: string[] = []
  const seccionesMap = new Map<string, Seccion>()
  const root: Seccion = { nombre: null, lineas: [] }
  seccionesMap.set('__root__', root)
  let current: Seccion = root

  for (const linea of lineasInput) {
    const trimmed = linea.trim()
    if (!trimmed) continue

    const subMatch = trimmed.match(PATRON_SUBSECCION)
    if (subMatch) {
      const candidato = subMatch[1].trim()
      const resto = subMatch[2].trim()
      if (esNotaAdmin(trimmed) && !resto) {
        notasAdminArr.push(trimmed.replace(/:\s*$/, ''))
        continue
      }
      if (esNotaAdmin(candidato + ':') && !resto) {
        notasAdminArr.push(candidato)
        continue
      }
      let sec = seccionesMap.get(candidato)
      if (!sec) {
        sec = { nombre: candidato, lineas: [] }
        seccionesMap.set(candidato, sec)
      }
      current = sec
      if (resto) sec.lineas.push(...splitLineas(resto))
      continue
    }

    if (esNotaAdmin(trimmed)) {
      notasAdminArr.push(trimmed)
      continue
    }

    current.lineas.push(...splitLineas(trimmed))
  }

  const orden: Seccion[] = []
  if (root.lineas.length > 0) orden.push(root)
  for (const [key, sec] of seccionesMap.entries()) {
    if (key === '__root__') continue
    if (sec.lineas.length > 0) orden.push(sec)
  }

  return {
    notasAdmin: notasAdminArr.length > 0 ? notasAdminArr.join('\n') : null,
    secciones: orden.length > 0 ? orden : [{ nombre: null, lineas: [] }],
  }
}

function esNotaAdmin(linea: string): boolean {
  return NOTAS_ADMIN.some(re => re.test(linea))
}

function splitLineas(s: string): string[] {
  return s.split(SEPARADORES).map(x => x.trim()).filter(Boolean)
}
