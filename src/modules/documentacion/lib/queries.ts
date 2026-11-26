import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import {
  DOCUMENTACION_BUCKET,
  type Categoria,
  type DocumentoEditable,
  type DocumentoEmpresa,
} from './types'

const LISTA_KEY = ['documentacion', 'lista'] as const

const COLUMNAS =
  'id, categoria, tipo, modelo, titulo, ejercicio, periodo, fecha_documento, estado, entidad_nif, csv_aeat, justificante, storage_path, nombre_original, mime_type, bytes, sha256, origen, origen_ref, notas, created_at'

export function useDocumentos() {
  return useQuery({
    queryKey: LISTA_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<DocumentoEmpresa[]> => {
      const { data, error } = await supabase
        .from('documentos_empresa')
        .select(COLUMNAS)
        .order('categoria')
        .order('ejercicio', { ascending: false, nullsFirst: false })
        .order('periodo', { ascending: false, nullsFirst: false })
        .order('fecha_documento', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data ?? []).map((r) => ({
        ...(r as DocumentoEmpresa),
        ejercicio: r.ejercicio == null ? null : Number(r.ejercicio),
        bytes: r.bytes == null ? null : Number(r.bytes),
      }))
    },
  })
}

export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase() || 'documento'

export const rutaDocumento = (categoria: Categoria, ejercicio: number | null, nombre: string) =>
  `${categoria}/${ejercicio ?? 'sin-ejercicio'}/${crypto.randomUUID()}-${slug(nombre)}`

export function useSubirDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (opts: { file: File; datos: DocumentoEditable }) => {
      const sha = await sha256Hex(opts.file)
      const { data: existente, error: dupErr } = await supabase
        .from('documentos_empresa')
        .select('titulo')
        .eq('sha256', sha)
        .maybeSingle()
      if (dupErr) throw dupErr
      if (existente) throw new Error(`Ya está archivado como «${existente.titulo}»`)

      const path = rutaDocumento(opts.datos.categoria, opts.datos.ejercicio, opts.file.name)
      const { error: upErr } = await supabase.storage
        .from(DOCUMENTACION_BUCKET)
        .upload(path, opts.file, { contentType: opts.file.type || undefined, upsert: false })
      if (upErr) throw upErr

      const { error: dbErr } = await supabase.from('documentos_empresa').insert({
        ...opts.datos,
        storage_path: path,
        nombre_original: opts.file.name,
        mime_type: opts.file.type || null,
        bytes: opts.file.size,
        sha256: sha,
        origen: 'subida',
      })
      if (dbErr) {
        await supabase.storage.from(DOCUMENTACION_BUCKET).remove([path])
        throw dbErr
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LISTA_KEY }),
  })
}

export function useEditarDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (opts: { id: string; cambios: Partial<DocumentoEditable> }) => {
      const { error } = await supabase.from('documentos_empresa').update(opts.cambios).eq('id', opts.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LISTA_KEY }),
  })
}

export function useBorrarDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (d: Pick<DocumentoEmpresa, 'id' | 'storage_path'>) => {
      const { error } = await supabase.from('documentos_empresa').delete().eq('id', d.id)
      if (error) throw error
      const { error: stErr } = await supabase.storage.from(DOCUMENTACION_BUCKET).remove([d.storage_path])
      if (stErr) throw stErr
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LISTA_KEY }),
  })
}

/** URL firmada de 5 minutos; con `descargar` fuerza la descarga con el nombre original. */
export async function urlDocumento(d: Pick<DocumentoEmpresa, 'storage_path' | 'nombre_original'>, descargar: boolean) {
  const { data, error } = await supabase.storage
    .from(DOCUMENTACION_BUCKET)
    .createSignedUrl(d.storage_path, 5 * 60, descargar ? { download: d.nombre_original } : undefined)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('Sin URL firmada')
  return data.signedUrl
}
