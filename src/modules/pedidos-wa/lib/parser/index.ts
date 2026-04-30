import { supabase } from '@/shared/lib/supabase'
import type { LineaParseada, ResultadoParser, Unidad } from '../types'
import { parsearLineaConRegex } from './core'
import { loadDiccionario } from './diccionario'
import { preprocesar } from './preprocesar'

type FallbackPendiente = {
  rawLine: string
  orden: number
  subseccion: string | null
}

type ClaudeRespuesta = {
  lineas: Array<{
    orden: number
    cantidad: number
    unidad: Unidad
    producto: string
    productoRaw: string
    subseccion: string | null
    notas: string | null
    esGratis: boolean
  }>
}

export async function parsearPedido(
  texto: string,
  clienteNombre: string,
): Promise<ResultadoParser> {
  const { dict, userEntries } = await loadDiccionario()
  const { notasAdmin, secciones } = preprocesar(texto)

  const lineas: LineaParseada[] = []
  const pendientes: FallbackPendiente[] = []
  let orden = 0

  for (const seccion of secciones) {
    for (const rawLinea of seccion.lineas) {
      orden += 1
      const result = parsearLineaConRegex(rawLinea, dict)
      if (result.confianza === 'alta') {
        lineas.push({
          ...result.linea,
          orden,
          subseccion: seccion.nombre ?? null,
          metodo: 'regex',
        })
      } else {
        pendientes.push({
          rawLine: rawLinea,
          orden,
          subseccion: seccion.nombre ?? null,
        })
      }
    }
  }

  if (pendientes.length > 0) {
    try {
      const claudeLineas = await invokeClaudeFallback(
        pendientes.map(p => p.rawLine),
        clienteNombre,
        userEntries.map(e => ({ abreviatura: e.abreviatura, producto: e.producto_normalizado })),
      )
      claudeLineas.forEach((l, i) => {
        const meta = pendientes[i]
        if (!meta) return
        lineas.push({
          orden: meta.orden,
          cantidad: l.cantidad,
          unidad: l.unidad,
          producto: l.producto,
          productoRaw: l.productoRaw || meta.rawLine,
          subseccion: meta.subseccion,
          notas: l.notas,
          esGratis: l.esGratis,
          metodo: 'claude',
        })
      })
    } catch {
      // Si Claude falla, marcar líneas pendientes como manual con producto raw
      pendientes.forEach(meta => {
        lineas.push({
          orden: meta.orden,
          cantidad: 1,
          unidad: 'unidad',
          producto: meta.rawLine,
          productoRaw: meta.rawLine,
          subseccion: meta.subseccion,
          notas: 'Revisar — parser no pudo resolver',
          esGratis: false,
          metodo: 'manual',
        })
      })
    }
  }

  lineas.sort((a, b) => a.orden - b.orden)

  return { notasAdmin, lineas, textoOriginal: texto }
}

async function invokeClaudeFallback(
  lineas_pendientes: string[],
  cliente_nombre: string,
  abreviaturas_extra: { abreviatura: string; producto: string }[],
): Promise<ClaudeRespuesta['lineas']> {
  const { data, error } = await supabase.functions.invoke<ClaudeRespuesta>('parser-pedido', {
    body: { lineas_pendientes, cliente_nombre, abreviaturas_extra },
  })
  if (error) throw error
  if (!data || !Array.isArray(data.lineas)) {
    throw new Error('Respuesta inválida de parser-pedido')
  }
  return data.lineas
}
