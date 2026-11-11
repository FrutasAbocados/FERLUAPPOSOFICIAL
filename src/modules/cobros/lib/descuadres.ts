import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

/**
 * Deuda de cierres de reparto aprobados que no ha llegado a Cobros.
 * Lo calcula `cobros_cierre_descuadres()`; desaparece en cuanto se cuadra.
 */
export type MotivoDescuadre =
  | 'sin_factura'
  | 'importe_distinto'
  | 'cliente_sin_enlace'
  | 'sin_cliente'
  | 'pendiente'

export type FacturaCandidata = {
  doc_number: string
  fecha: string
  total: number
  en_cobros: boolean
}

export type DescuadreCierre = {
  jornada_id: string
  fecha: string
  repartidor: string | null
  contact_id: string | null
  contact_nombre: string
  contact_key: string
  importe: number
  motivo: MotivoDescuadre
  cliente_id: string | null
  candidatas: FacturaCandidata[]
}

export const MOTIVO_LABEL: Record<MotivoDescuadre, string> = {
  sin_factura: 'Sin factura en Holded',
  importe_distinto: 'Importe distinto a Holded',
  cliente_sin_enlace: 'Cliente sin ficha en Cobros',
  sin_cliente: 'Línea sin cliente de Holded',
  pendiente: 'Pendiente de pasar',
}

const KEY = ['cobros', 'descuadres-cierre'] as const

export function useDescuadresCierre() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<DescuadreCierre[]> => {
      const { data, error } = await supabase.rpc('cobros_cierre_descuadres')
      if (error) throw error
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        jornada_id: r.jornada_id as string,
        fecha: r.fecha as string,
        repartidor: (r.repartidor as string | null) ?? null,
        contact_id: (r.contact_id as string | null) ?? null,
        contact_nombre: r.contact_nombre as string,
        contact_key: r.contact_key as string,
        importe: Number(r.importe ?? 0),
        motivo: r.motivo as MotivoDescuadre,
        cliente_id: (r.cliente_id as string | null) ?? null,
        candidatas: ((r.candidatas ?? []) as Array<Record<string, unknown>>).map((c) => ({
          doc_number: c.doc_number as string,
          fecha: c.fecha as string,
          total: Number(c.total ?? 0),
          en_cobros: !!c.en_cobros,
        })),
      }))
    },
  })
}

export function useCuadrarDescuadre() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      d: DescuadreCierre
      numero_factura?: string | null
      cliente_id?: string | null
      nota?: string | null
    }) => {
      const { error } = await supabase.rpc('cobros_cierre_cuadrar', {
        p_jornada_id: input.d.jornada_id,
        p_contact_key: input.d.contact_key,
        p_importe: input.d.importe,
        p_numero_factura: input.numero_factura ?? null,
        p_cliente_id: input.cliente_id ?? null,
        p_nota: input.nota ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cobros'] }),
  })
}

export function useEnlazarClienteCobros() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { contact_id: string; cliente_id: string }): Promise<number> => {
      const { data, error } = await supabase.rpc('cobros_cliente_enlazar', {
        p_contact_id: input.contact_id,
        p_cliente_id: input.cliente_id,
      })
      if (error) throw error
      return Number((data as { nuevas?: number } | null)?.nuevas ?? 0)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cobros'] }),
  })
}
