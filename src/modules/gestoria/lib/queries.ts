import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { GestoriaFila, GestoriaFiltros } from './types'

const DOCUMENTS_BUCKET = 'gestoria-documentos'

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
      const { data, error } = await supabase.rpc(rpc, {
        p_desde: filtros.desde,
        p_hasta: filtros.hasta,
        p_tipo: filtros.tipo,
      })
      if (error) throw error
      const normalize = filtros.nivel === 'documentos' ? normalizeDocument : normalizeLine
      return ((data ?? []) as Record<string, unknown>[]).map(normalize)
    },
  })
}
