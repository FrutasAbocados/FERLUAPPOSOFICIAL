import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { PayloadImportacion } from './importar.ts'

export type EstadoConciliacion = 'cuadra' | 'importe distinto' | 'factura no encontrada' | 'sin referencia'

export type FacturaCitada = {
  numero: string
  fecha?: string
  cliente?: string
  total?: number | string
  pendiente_holded?: number | string
  en_cobros?: boolean
  cobrada_en_cobros?: boolean
  no_encontrada?: boolean
}

export type FilaConciliacion = {
  movimiento_id: string
  fecha: string
  importe: number
  concepto: string
  detalle: string
  facturas_citadas: string[]
  facturas: FacturaCitada[]
  total_facturas: number | null
  diferencia: number | null
  estado: EstadoConciliacion
}

export function useBancoConciliacion(desde: string, hasta: string, enabled: boolean) {
  return useQuery({
    queryKey: ['gestoria', 'banco', desde, hasta] as const,
    enabled: enabled && Boolean(desde && hasta && desde <= hasta),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FilaConciliacion[]> => {
      const { data, error } = await supabase.rpc('banco_conciliacion', { p_desde: desde, p_hasta: hasta })
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        movimiento_id: String(r.movimiento_id),
        fecha: String(r.fecha),
        importe: Number(r.importe ?? 0),
        concepto: String(r.concepto ?? ''),
        detalle: String(r.detalle ?? ''),
        facturas_citadas: (r.facturas_citadas as string[] | null) ?? [],
        facturas: (r.facturas as FacturaCitada[] | null) ?? [],
        total_facturas: r.total_facturas == null ? null : Number(r.total_facturas),
        diferencia: r.diferencia == null ? null : Number(r.diferencia),
        estado: r.estado as EstadoConciliacion,
      }))
    },
  })
}

export type ResultadoImportacion = { extracto_id: string; nuevos: number; repetidos: number }

export async function importarExtracto(payload: PayloadImportacion): Promise<ResultadoImportacion> {
  const { data, error } = await supabase.rpc('banco_importar_extracto', payload)
  if (error) throw error
  return data as ResultadoImportacion
}
