import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

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
}

export type ObjetivoSelf = {
  titulo: string
  descripcion: string | null
  importe: number
  cumplido: boolean
}

const num = (v: unknown) => Number(v ?? 0)

/** Admin/responsable: objetivos de todos los trabajadores activos + estado del mes. */
export function useObjetivosAdmin(mesISO: string) {
  return useQuery({
    queryKey: ['objetivos', 'admin', mesISO] as const,
    queryFn: async (): Promise<ObjetivoAdminRow[]> => {
      const { data: objetivos, error: e1 } = await supabase
        .from('empleado_objetivos')
        .select('id, empleado_id, titulo, descripcion, importe, activo, empleados!inner(nombre, activo)')
        .eq('activo', true)
        .eq('empleados.activo', true)
      if (e1) throw e1

      const objs = (objetivos ?? []) as unknown as Array<{
        id: string; empleado_id: string; titulo: string; descripcion: string | null
        importe: string | number; activo: boolean; empleados: { nombre: string } | { nombre: string }[]
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
      const { data: obj, error } = await supabase
        .from('empleado_objetivos')
        .select('id, titulo, descripcion, importe')
        .eq('activo', true)
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
      }
    },
  })
}
