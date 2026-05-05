import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

export type AlertType =
  | 'deuda'
  | 'pedido_esperado'
  | 'producto_anomalo'
  | 'riesgo_fuga'
  | 'coste_subiendo'

export type AlertaDescartada = {
  alert_type: AlertType
  entity_id: string
  descartada_at: string
  motivo: string | null
}

const KEY = ['dashboard', 'alertas-descartadas'] as const

export function useAlertasDescartadas() {
  const q = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<AlertaDescartada[]> => {
      const { data, error } = await supabase
        .from('dashboard_alertas_descartadas')
        .select('alert_type, entity_id, descartada_at, motivo')
        .order('descartada_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as AlertaDescartada[]
    },
    staleTime: 60_000,
  })

  const set = new Set((q.data ?? []).map((d) => `${d.alert_type}:${d.entity_id}`))
  const isDescartada = (alert_type: AlertType, entity_id: string) =>
    set.has(`${alert_type}:${entity_id}`)

  return {
    ...q,
    isDescartada,
    set,
    list: q.data ?? [],
  }
}

export function useDescartarAlerta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { alert_type: AlertType; entity_id: string; motivo?: string | null }) => {
      const { error } = await supabase.from('dashboard_alertas_descartadas').upsert(
        {
          alert_type: input.alert_type,
          entity_id:  input.entity_id,
          motivo:     input.motivo ?? null,
          descartada_at: new Date().toISOString(),
        },
        { onConflict: 'alert_type,entity_id' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useRestaurarAlerta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { alert_type: AlertType; entity_id: string }) => {
      const { error } = await supabase
        .from('dashboard_alertas_descartadas')
        .delete()
        .eq('alert_type', input.alert_type)
        .eq('entity_id', input.entity_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useRestaurarTodas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('dashboard_alertas_descartadas')
        .delete()
        .gt('descartada_at', '1900-01-01')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
