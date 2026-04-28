import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { supabase } from '@/shared/lib/supabase'
import type { KpiMes, SyncLog, Tipo, TopContacto } from './types'

const isoDate = (d: Date) => format(d, 'yyyy-MM-dd')

export const monthRange = (anchor: Date) => ({
  from: isoDate(startOfMonth(anchor)),
  to: isoDate(endOfMonth(anchor)),
})

const monthKey = (anchor: Date) => format(startOfMonth(anchor), 'yyyy-MM')

// KPIs del mes — ventas / compras / margen / pendiente cobro.
// Ventas desde manager_ventas_efectivas (regla auto-albarán: clientes con
// waybill ese mes ignoran su invoice agregada). Compras desde manager_facturas.
export function useKpisMes(anchor: Date) {
  const { from, to } = monthRange(anchor)
  return useQuery({
    queryKey: ['manager', 'kpis', monthKey(anchor)] as const,
    queryFn: async (): Promise<KpiMes> => {
      const [ventasRes, comprasRes] = await Promise.all([
        supabase
          .from('manager_ventas_efectivas')
          .select('subtotal,total,payments_pending')
          .gte('fecha', from)
          .lte('fecha', to),
        supabase
          .from('manager_facturas')
          .select('subtotal,total')
          .eq('tipo', 'COMPRA')
          .gte('fecha', from)
          .lte('fecha', to),
      ])
      if (ventasRes.error) throw ventasRes.error
      if (comprasRes.error) throw comprasRes.error
      const k: KpiMes = {
        ventas_n: 0, ventas_subtotal: 0, ventas_total: 0, ventas_pendiente: 0,
        compras_n: 0, compras_subtotal: 0, compras_total: 0, margen: 0,
      }
      for (const r of ventasRes.data ?? []) {
        k.ventas_n++
        k.ventas_subtotal += Number(r.subtotal ?? 0)
        k.ventas_total += Number(r.total ?? 0)
        k.ventas_pendiente += Number(r.payments_pending ?? 0)
      }
      for (const r of comprasRes.data ?? []) {
        k.compras_n++
        k.compras_subtotal += Number(r.subtotal ?? 0)
        k.compras_total += Number(r.total ?? 0)
      }
      k.margen = k.ventas_subtotal - k.compras_subtotal
      return k
    },
  })
}

export function useTopContactos(anchor: Date, tipo: Tipo, limit = 5) {
  const { from, to } = monthRange(anchor)
  return useQuery({
    queryKey: ['manager', 'top', tipo, monthKey(anchor), limit] as const,
    queryFn: async (): Promise<TopContacto[]> => {
      // Ventas → vista efectivas (sin doble contabilidad). Compras → tabla cruda.
      const query = tipo === 'VENTA'
        ? supabase
            .from('manager_ventas_efectivas')
            .select('contact_name,subtotal')
            .gte('fecha', from)
            .lte('fecha', to)
        : supabase
            .from('manager_facturas')
            .select('contact_name,subtotal')
            .eq('tipo', 'COMPRA')
            .gte('fecha', from)
            .lte('fecha', to)
      const { data, error } = await query
      if (error) throw error
      const map = new Map<string, TopContacto>()
      for (const r of data ?? []) {
        const name = r.contact_name ?? '(sin contacto)'
        const cur = map.get(name) ?? { contact_name: name, n: 0, subtotal: 0 }
        cur.n++
        cur.subtotal += Number(r.subtotal ?? 0)
        map.set(name, cur)
      }
      return Array.from(map.values()).sort((a, b) => b.subtotal - a.subtotal).slice(0, limit)
    },
  })
}

export function useUltimoSync() {
  return useQuery({
    queryKey: ['manager', 'sync', 'last'] as const,
    queryFn: async (): Promise<SyncLog | null> => {
      const { data, error } = await supabase
        .from('manager_holded_sync')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0] ?? null) as SyncLog | null
    },
    refetchInterval: 60_000,
  })
}

export function useSyncManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (range: { start?: string; end?: string } | undefined) => {
      const { data, error } = await supabase.functions.invoke('holded-sync', {
        body: { ...range, trigger: 'manual' },
      })
      if (error) throw error
      return data as { ok: boolean; ventas: number; compras: number; lineas: number; errors: string[] }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager'] })
    },
  })
}
