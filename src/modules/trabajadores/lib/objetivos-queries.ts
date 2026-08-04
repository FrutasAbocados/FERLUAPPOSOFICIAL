import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

/** Métrica de progreso ligada al objetivo; null = solo binario cumplido/no. */
export type ObjetivoMetrica = 'bbdd_clientes' | null

export type ObjetivoAdminRow = {
  objetivo_id: string
  empleado_id: string
  nombre: string
  titulo: string
  descripcion: string | null
  importe: number
  activo: boolean
  cumplido: boolean
  importe_aplicado: number
  nota: string | null
  metrica: ObjetivoMetrica
}

export type ObjetivoSelf = {
  titulo: string
  descripcion: string | null
  importe: number
  cumplido: boolean
  metrica: ObjetivoMetrica
}

/** Avance real del objetivo "BBDD de clientes al día". */
export type ProgresoBBDDClientes = {
  total: number
  con_ficha: number
  pct: number
  fichas_mes: number
  ultima_actualizacion: string | null
}

const num = (v: unknown) => Number(v ?? 0)
const metrica = (v: unknown): ObjetivoMetrica => (v === 'bbdd_clientes' ? 'bbdd_clientes' : null)

/**
 * Clientes con ficha de preferencias rellenada sobre los que han comprado en los
 * últimos 90 días. Es el dato que decide el plus, no una estimación visual.
 */
export function useProgresoBBDDClientes(mesISO: string, enabled = true) {
  return useQuery({
    queryKey: ['objetivos', 'progreso-bbdd', mesISO] as const,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ProgresoBBDDClientes> => {
      const { data, error } = await supabase.rpc('objetivo_bbdd_clientes_progreso', { p_dias: 90, p_mes: mesISO })
      if (error) throw error
      const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
      return {
        total: num(r?.total),
        con_ficha: num(r?.con_ficha),
        pct: num(r?.pct),
        fichas_mes: num(r?.fichas_mes),
        ultima_actualizacion: (r?.ultima_actualizacion as string | null) ?? null,
      }
    },
  })
}

/** Admin/responsable: objetivos de todos los trabajadores activos + estado del mes. */
export function useObjetivosAdmin(mesISO: string) {
  return useQuery({
    queryKey: ['objetivos', 'admin', mesISO] as const,
    queryFn: async (): Promise<ObjetivoAdminRow[]> => {
      const { data: objetivos, error: e1 } = await supabase
        .from('empleado_objetivos')
        .select('id, empleado_id, titulo, descripcion, importe, activo, metrica, empleados!inner(nombre, activo)')
        .eq('activo', true)
        .eq('empleados.activo', true)
      if (e1) throw e1

      const objs = (objetivos ?? []) as unknown as Array<{
        id: string; empleado_id: string; titulo: string; descripcion: string | null
        importe: string | number; activo: boolean; metrica: string | null
        empleados: { nombre: string } | { nombre: string }[]
      }>
      const ids = objs.map(o => o.id)

      const { data: meses, error: e2 } = ids.length
        ? await supabase
            .from('empleado_objetivo_mes')
            .select('objetivo_id, cumplido, importe_aplicado, nota')
            .eq('mes', mesISO)
            .in('objetivo_id', ids)
        : { data: [], error: null }
      if (e2) throw e2

      const byObj = new Map<string, { cumplido: boolean; importe_aplicado: number; nota: string | null }>()
      for (const m of (meses ?? []) as Array<{ objetivo_id: string; cumplido: boolean; importe_aplicado: string | number; nota: string | null }>) {
        byObj.set(m.objetivo_id, { cumplido: !!m.cumplido, importe_aplicado: num(m.importe_aplicado), nota: m.nota })
      }

      return objs
        .map(o => {
          const emp = Array.isArray(o.empleados) ? o.empleados[0] : o.empleados
          const est = byObj.get(o.id)
          return {
            objetivo_id: o.id,
            empleado_id: o.empleado_id,
            nombre: emp?.nombre ?? '—',
            titulo: o.titulo,
            descripcion: o.descripcion,
            importe: num(o.importe),
            activo: o.activo,
            cumplido: est?.cumplido ?? false,
            importe_aplicado: est?.importe_aplicado ?? 0,
            nota: est?.nota ?? null,
            metrica: metrica(o.metrica),
          }
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    },
  })
}

/** Marca (o desmarca) el cumplimiento del mes; congela el importe aplicado. */
export function useMarcarMes(mesISO: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { objetivo_id: string; importe: number; cumplido: boolean; nota?: string | null }) => {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('empleado_objetivo_mes')
        .upsert({
          objetivo_id: input.objetivo_id,
          mes: mesISO,
          cumplido: input.cumplido,
          importe_aplicado: input.cumplido ? input.importe : 0,
          nota: input.nota ?? null,
          marcado_por: userData.user?.id ?? null,
          marcado_at: new Date().toISOString(),
        }, { onConflict: 'objetivo_id,mes' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['objetivos', 'admin', mesISO] }),
  })
}

/** Edita la definición del objetivo (título / descripción / importe / activo). */
export function useUpdateObjetivo(mesISO: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { objetivo_id: string; patch: Partial<{ titulo: string; descripcion: string | null; importe: number; activo: boolean }> }) => {
      const { error } = await supabase.from('empleado_objetivos').update(input.patch).eq('id', input.objetivo_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['objetivos', 'admin', mesISO] }),
  })
}

/** Card del trabajador: su objetivo activo + estado del mes en curso. */
export function useObjetivoSelf(mesISO: string) {
  return useQuery({
    queryKey: ['objetivos', 'self', mesISO] as const,
    queryFn: async (): Promise<ObjetivoSelf | null> => {
      // El admin ve todos los objetivos por RLS: hay que atarlo al empleado logueado
      // o su card mostraría el objetivo de otro.
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData.user?.id
      if (!uid) return null

      const { data: obj, error } = await supabase
        .from('empleado_objetivos')
        .select('id, titulo, descripcion, importe, metrica, empleados!inner(user_id)')
        .eq('activo', true)
        .eq('empleados.user_id', uid)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!obj) return null

      const { data: mes } = await supabase
        .from('empleado_objetivo_mes')
        .select('cumplido')
        .eq('objetivo_id', obj.id)
        .eq('mes', mesISO)
        .maybeSingle()

      return {
        titulo: obj.titulo,
        descripcion: obj.descripcion,
        importe: num(obj.importe),
        cumplido: !!mes?.cumplido,
        metrica: metrica(obj.metrica),
      }
    },
  })
}
