import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import { supabase } from '@/shared/lib/supabase'
import type { Cierre, CierreInput } from './types'

const monthKey = (anchor: Date) =>
  ['cash', 'mes', format(startOfMonth(anchor), 'yyyy-MM')] as const

const isoDate = (d: Date) => format(d, 'yyyy-MM-dd')

export const monthRange = (anchor: Date): { from: string; to: string } => ({
  from: isoDate(startOfMonth(anchor)),
  to: isoDate(endOfMonth(anchor)),
})

export function useCierresMes(anchor: Date) {
  const { from, to } = monthRange(anchor)
  return useQuery({
    queryKey: monthKey(anchor),
    queryFn: async (): Promise<Cierre[]> => {
      const { data, error } = await supabase
        .from('cierres')
        .select('*')
        .gte('fecha', from)
        .lte('fecha', to)
        .order('fecha', { ascending: true })
      if (error) throw error
      return (data ?? []) as Cierre[]
    },
  })
}

// Deuda acumulada hasta el último día del mes (cierre incluido).
// Sumamos toda la historia hasta ese punto: deuda_generada - deuda_cobrada.
export function useDeudaAcumHasta(anchor: Date) {
  const { to } = monthRange(anchor)
  return useQuery({
    queryKey: ['cash', 'deuda-acum', to] as const,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('cierres')
        .select('deuda_generada, deuda_cobrada')
        .lte('fecha', to)
      if (error) throw error
      const rows = (data ?? []) as Pick<Cierre, 'deuda_generada' | 'deuda_cobrada'>[]
      return rows.reduce(
        (acc, r) => acc + Number(r.deuda_generada) - Number(r.deuda_cobrada),
        0,
      )
    },
  })
}

export function useUpsertCierre() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CierreInput): Promise<Cierre> => {
      const { data, error } = await supabase
        .from('cierres')
        .upsert(input, { onConflict: 'fecha' })
        .select('*')
        .single()
      if (error) throw error
      return data as Cierre
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash'] })
    },
  })
}

export function useDeleteCierre() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('cierres').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash'] })
    },
  })
}

export const shiftMonth = (anchor: Date, by: number): Date =>
  startOfMonth(addMonths(anchor, by))

// ── Autorellenar cierre desde repartos + manager ──────────────────────────
export type AutorrellenarDia = {
  efectivo: number
  tarjeta: number
  compras: number
  pedidos: number
  deuda_generada: number
}

export async function fetchAutorrellenarDia(fecha: string): Promise<AutorrellenarDia> {
  const { data, error } = await supabase.rpc('cash_autorellenar_dia', { p_fecha: fecha })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    efectivo:       Number(row?.efectivo ?? 0),
    tarjeta:        Number(row?.tarjeta ?? 0),
    compras:        Number(row?.compras ?? 0),
    pedidos:        Number(row?.pedidos ?? 0),
    deuda_generada: Number(row?.deuda_generada ?? 0),
  }
}
