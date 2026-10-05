import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { GestoriaFila, GestoriaFiltros } from './types'

const DOCUMENTS_BUCKET = 'gestoria-documentos'
const PAGE_SIZE = 1000
const MAX_DOCUMENTOS = 10_000
const MAX_LINEAS = 50_000

function text(row: Record<string, unknown>, key: string): string {
  return row[key] == null ? '' : String(row[key])
}

function numberOrNull(row: Record<string, unknown>, key: string): number | null {
  return row[key] == null ? null : Number(row[key])
}

function normalizeDocument(row: Record<string, unknown>): GestoriaFila {
  return {
    tipo: text(row, 'tipo'),
    subtipo: text(row, 'subtipo'),
    fecha: text(row, 'fecha'),
    numero: text(row, 'numero'),
    tercero: text(row, 'tercero'),
    base_imponible: numberOrNull(row, 'base_imponible'),
    iva: numberOrNull(row, 'iva'),
    total: numberOrNull(row, 'total'),
    pendiente: numberOrNull(row, 'pendiente'),
    descripcion: '',
    sku: '',
    cantidad: null,
    precio_unitario: null,
    iva_pct: null,
    importe: null,
    total_documento: null,
    pdf_path: row.pdf_path == null ? null : String(row.pdf_path),
    foto_paths: Array.isArray(row.foto_paths) ? row.foto_paths.map(String) : [],
  }
}

function normalizeLine(row: Record<string, unknown>): GestoriaFila {
  return {
    tipo: text(row, 'tipo'),
    subtipo: text(row, 'subtipo'),
    fecha: text(row, 'fecha'),
    numero: text(row, 'numero'),
    tercero: text(row, 'tercero'),
    base_imponible: null,
    iva: null,
    total: null,
    pendiente: null,
    descripcion: text(row, 'descripcion'),
    sku: text(row, 'sku'),
    cantidad: numberOrNull(row, 'cantidad'),
    precio_unitario: numberOrNull(row, 'precio_unitario'),
    iva_pct: numberOrNull(row, 'iva_pct'),
    importe: numberOrNull(row, 'importe'),
    total_documento: numberOrNull(row, 'total_documento'),
    pdf_path: null,
    foto_paths: [],
  }
}

function visibleParaGestoria(row: GestoriaFila): boolean {
  // Las ventas internas de la frutería propia siguen vivas en Manager, pero no
  // forman parte de la documentación que debe recibir Gedofu. En ventas solo
  // entran facturas: los albaranes se consolidan a fin de mes y duplicarían el
  // importe si apareciesen junto a su factura. Holded muestra en "Facturas"
  // tanto invoice como salesreceipt (facturas simplificadas/tickets).
  const subtipo = row.subtipo.trim().toLocaleLowerCase('es')
  if (subtipo === 'abuelo') return false
  return row.tipo !== 'VENTA' || subtipo === 'invoice' || subtipo === 'salesreceipt'
}

export async function createGestoriaDocumentUrl(
  path: string,
  download?: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, 5 * 60, download ? { download } : undefined)
  if (error) throw error
  return data.signedUrl
}

export function useGestoriaDatos(filtros: GestoriaFiltros) {
  return useQuery({
    queryKey: ['gestoria', filtros.nivel, filtros.tipo, filtros.desde, filtros.hasta] as const,
    enabled: Boolean(filtros.desde && filtros.hasta && filtros.desde <= filtros.hasta),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GestoriaFila[]> => {
      const rpc = filtros.nivel === 'documentos' ? 'gestoria_documentos' : 'gestoria_lineas'
      // PostgREST corta cada respuesta en 1.000 filas sin avisar: un trimestre
      // de ventas tiene más y Gestoría perdía los documentos más antiguos.
      const maxRows = filtros.nivel === 'documentos' ? MAX_DOCUMENTOS : MAX_LINEAS
      const rows: Record<string, unknown>[] = []
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .rpc(rpc, {
            p_desde: filtros.desde,
            p_hasta: filtros.hasta,
            p_tipo: filtros.tipo,
          })
          .range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        const page = (data ?? []) as Record<string, unknown>[]
        rows.push(...page)
        if (page.length < PAGE_SIZE) break
        if (rows.length >= maxRows) {
          // Mejor un error claro que un total incompleto enviado a la gestoría.
          throw new Error(`Más de ${maxRows.toLocaleString('es-ES')} filas: acorta el rango de fechas`)
        }
      }
      const normalize = filtros.nivel === 'documentos' ? normalizeDocument : normalizeLine
      return rows.map(normalize).filter(visibleParaGestoria)
    },
  })
}
