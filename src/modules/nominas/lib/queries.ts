import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

const BUCKET = 'nominas'

export interface EmpleadoLite {
  id: string
  nombre: string
}

export interface NominaRow {
  id: string
  empleado_id: string
  empleado_nombre: string | null
  periodo: string            // 'YYYY-MM-DD' (día 1 del mes)
  titulo: string | null
  storage_path: string
  size_bytes: number | null
  created_at: string
}

export interface MiNomina {
  id: string
  periodo: string
  titulo: string | null
  storage_path: string
  size_bytes: number | null
  created_at: string
}

const NOMINAS_ADMIN_KEY = ['nominas', 'admin'] as const
const EMPLEADOS_KEY = ['nominas', 'empleados'] as const
const MIS_NOMINAS_KEY = ['nominas', 'mias'] as const

/* ── Empleados activos (admin) ── */
export function useEmpleadosActivos() {
  return useQuery({
    queryKey: EMPLEADOS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EmpleadoLite[]> => {
      const { data, error } = await supabase
        .from('empleados')
        .select('id, nombre')
        .eq('activo', true)
        .order('orden', { ascending: true })
      if (error) throw error
      return (data ?? []) as EmpleadoLite[]
    },
  })
}

/* ── Todas las nóminas con nombre de empleado (admin) ── */
export function useNominasAdmin() {
  return useQuery({
    queryKey: NOMINAS_ADMIN_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<NominaRow[]> => {
      const { data, error } = await supabase
        .from('trabajadores_nominas')
        .select('id, empleado_id, periodo, titulo, storage_path, size_bytes, created_at, empleados(nombre)')
        .order('periodo', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        empleado_id: String(r.empleado_id),
        empleado_nombre:
          r.empleados && typeof r.empleados === 'object'
            ? ((r.empleados as { nombre?: string }).nombre ?? null)
            : null,
        periodo: String(r.periodo),
        titulo: r.titulo == null ? null : String(r.titulo),
        storage_path: String(r.storage_path),
        size_bytes: r.size_bytes == null ? null : Number(r.size_bytes),
        created_at: String(r.created_at),
      }))
    },
  })
}

/* ── Nóminas propias del empleado (RPC security definer) ── */
export function useMisNominas(enabled = true) {
  return useQuery({
    queryKey: MIS_NOMINAS_KEY,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<MiNomina[]> => {
      const { data, error } = await supabase.rpc('mis_nominas')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        periodo: String(r.periodo),
        titulo: r.titulo == null ? null : String(r.titulo),
        storage_path: String(r.storage_path),
        size_bytes: r.size_bytes == null ? null : Number(r.size_bytes),
        created_at: String(r.created_at),
      }))
    },
  })
}

/* ── Subir nómina (admin) ── */
export function useSubirNomina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (opts: {
      empleadoId: string
      periodo: string          // 'YYYY-MM-01'
      titulo: string | null
      file: File
    }) => {
      const { data: auth } = await supabase.auth.getUser()
      const path = `${opts.empleadoId}/${crypto.randomUUID()}.pdf`

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, opts.file, { contentType: 'application/pdf', upsert: false })
      if (upErr) throw upErr

      const { error: dbErr } = await supabase.from('trabajadores_nominas').insert({
        empleado_id: opts.empleadoId,
        periodo: opts.periodo,
        titulo: opts.titulo,
        storage_path: path,
        size_bytes: opts.file.size,
        uploaded_by: auth.user?.id ?? null,
      })
      if (dbErr) {
        // rollback del fichero si falla la fila
        await supabase.storage.from(BUCKET).remove([path])
        throw dbErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOMINAS_ADMIN_KEY })
    },
  })
}

/* ── Borrar nómina (admin) ── */
export function useBorrarNomina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (n: { id: string; storage_path: string }) => {
      const { error } = await supabase.from('trabajadores_nominas').delete().eq('id', n.id)
      if (error) throw error
      await supabase.storage.from(BUCKET).remove([n.storage_path])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOMINAS_ADMIN_KEY })
    },
  })
}

/* ── Descargar (signed URL 5 min) ── */
export async function descargarNomina(storagePath: string, nombreSugerido: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 5)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('Sin URL firmada')
  const a = document.createElement('a')
  a.href = data.signedUrl
  a.download = nombreSugerido
  a.target = '_blank'
  a.rel = 'noopener'
  a.click()
}
