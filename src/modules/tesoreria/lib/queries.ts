import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '@/shared/lib/supabase'
import type {
  Cuenta,
  CuentaConSaldo,
  CuentaInput,
  GastoFijo,
  Movimiento,
  MovimientoInput,
  Pago,
  PagoEstado,
  PagoInput,
} from './types'

const isoDate = (d: Date) => format(d, 'yyyy-MM-dd')

const KEYS = {
  cuentas: ['tesoreria', 'cuentas'] as const,
  movimientos: (cuentaId?: string) =>
    cuentaId
      ? (['tesoreria', 'movimientos', cuentaId] as const)
      : (['tesoreria', 'movimientos'] as const),
  pagos: (estado?: PagoEstado | 'todos') =>
    (['tesoreria', 'pagos', estado ?? 'todos'] as const),
  gastosFijos: ['tesoreria', 'gastos-fijos'] as const,
}

// ---- Cuentas con saldo computado ----
export function useCuentas() {
  return useQuery({
    queryKey: KEYS.cuentas,
    queryFn: async (): Promise<CuentaConSaldo[]> => {
      const [cuentasRes, movRes] = await Promise.all([
        supabase
          .from('tesoreria_cuentas')
          .select('*')
          .order('orden', { ascending: true })
          .order('nombre', { ascending: true }),
        supabase.from('tesoreria_movimientos').select('cuenta_id, importe'),
      ])
      if (cuentasRes.error) throw cuentasRes.error
      if (movRes.error) throw movRes.error

      const sumByCuenta = new Map<string, number>()
      for (const m of movRes.data ?? []) {
        sumByCuenta.set(
          m.cuenta_id,
          (sumByCuenta.get(m.cuenta_id) ?? 0) + Number(m.importe),
        )
      }
      return (cuentasRes.data ?? []).map((c) => ({
        ...(c as Cuenta),
        saldo_actual:
          Number((c as Cuenta).saldo_inicial) +
          (sumByCuenta.get((c as Cuenta).id) ?? 0),
      }))
    },
  })
}

export function useCreateCuenta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CuentaInput): Promise<Cuenta> => {
      const { data, error } = await supabase
        .from('tesoreria_cuentas')
        .insert(input)
        .select('*')
        .single()
      if (error) throw error
      return data as Cuenta
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}

// ---- Movimientos ----
export function useMovimientos(cuentaId?: string) {
  return useQuery({
    queryKey: KEYS.movimientos(cuentaId),
    queryFn: async (): Promise<Movimiento[]> => {
      let q = supabase
        .from('tesoreria_movimientos')
        .select('*')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (cuentaId) q = q.eq('cuenta_id', cuentaId)
      const { data, error } = await q.limit(200)
      if (error) throw error
      return (data ?? []) as Movimiento[]
    },
  })
}

export function useCreateMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: MovimientoInput): Promise<Movimiento> => {
      const { data, error } = await supabase
        .from('tesoreria_movimientos')
        .insert(input)
        .select('*')
        .single()
      if (error) throw error
      return data as Movimiento
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}

export function useDeleteMovimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('tesoreria_movimientos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}

// ---- Pagos ----
export function usePagos(estado: PagoEstado | 'todos' = 'pendiente') {
  return useQuery({
    queryKey: KEYS.pagos(estado),
    queryFn: async (): Promise<Pago[]> => {
      let q = supabase
        .from('tesoreria_pagos')
        .select('*')
        .order('fecha_vencimiento', { ascending: true })
      if (estado !== 'todos') q = q.eq('estado', estado)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Pago[]
    },
  })
}

export function useCreatePago() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: PagoInput): Promise<Pago> => {
      const { data, error } = await supabase
        .from('tesoreria_pagos')
        .insert(input)
        .select('*')
        .single()
      if (error) throw error
      return data as Pago
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}

export function useUpdatePagoEstado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      estado,
      fecha_pago,
    }: {
      id: string
      estado: PagoEstado
      fecha_pago: string | null
    }): Promise<void> => {
      const { error } = await supabase
        .from('tesoreria_pagos')
        .update({ estado, fecha_pago })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}

export function useDeletePago() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('tesoreria_pagos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tesoreria'] }),
  })
}

// ---- Gastos fijos ----
export function useGastosFijos() {
  return useQuery({
    queryKey: KEYS.gastosFijos,
    queryFn: async (): Promise<GastoFijo[]> => {
      const { data, error } = await supabase
        .from('tesoreria_gastos_fijos')
        .select('*')
        .order('dia_mes', { ascending: true })
      if (error) throw error
      return (data ?? []) as GastoFijo[]
    },
  })
}

// ---- Helpers de rango fechas para KPIs ----
export const proximos7Dias = (today = new Date()) => ({
  from: isoDate(today),
  to: isoDate(addDays(today, 7)),
})

export const mesActual = (today = new Date()) => ({
  from: isoDate(startOfMonth(today)),
  to: isoDate(endOfMonth(today)),
})
