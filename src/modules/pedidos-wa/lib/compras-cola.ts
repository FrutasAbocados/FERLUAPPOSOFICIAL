import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

const GESTORIA_DOCUMENTOS_BUCKET = 'gestoria-documentos'

// ─── Cola de facturas en servidor ────────────────────────────────────────────
// El navegador solo sube los PDFs y deja una fila por factura; el worker
// `compras-cola-worker` hace OCR → guardar → Holded aunque se cierre la app.

export type EstadoCola =
  | 'espera' | 'ocr' | 'guardando' | 'subiendo'
  | 'ok' | 'revisar' | 'error' | 'cancelado'

export const ESTADOS_COLA_ACTIVOS: EstadoCola[] = ['espera', 'ocr', 'guardando', 'subiendo']

export type ItemColaDB = {
  id: string
  lote_id: string
  orden: number
  nombre: string
  estado: EstadoCola
  detalle: string | null
  compra_id: string | null
  proveedor: string | null
  num_factura: string | null
  total: number | string | null
  holded_num: string | null
  created_at: string
}

const COLA_KEY = ['pedidos_wa', 'compras-cola'] as const

/** Despierta el worker. No se espera: si el móvil se duerme, el cron lo relanza. */
export function despertarWorkerCompras() {
  void supabase.functions.invoke('compras-cola-worker', { body: {} }).catch(() => {})
}

/**
 * Sube cada PDF a Storage y lo deja en cola. Devuelve cuántos quedaron
 * encolados; los que no se pudieron subir se devuelven en `fallidos`.
 */
export async function encolarFacturasProveedor(
  files: File[],
  onProgreso?: (subidos: number, total: number) => void,
): Promise<{ encolados: number; fallidos: string[] }> {
  const { data: lote, error: errLote } = await supabase
    .from('pedidos_wa_compras_cola_lotes')
    .insert({ total: files.length })
    .select('id')
    .single()
  if (errLote || !lote) throw errLote ?? new Error('No se pudo crear la tanda')

  const fallidos: string[] = []
  let encolados = 0
  for (const [i, file] of files.entries()) {
    const path = `cola/${lote.id}/${i + 1}-${crypto.randomUUID()}.pdf`
    try {
      const { error: errUp } = await supabase.storage
        .from(GESTORIA_DOCUMENTOS_BUCKET)
        .upload(path, file, { contentType: 'application/pdf', upsert: false })
      if (errUp) throw errUp
      const { error: errIns } = await supabase
        .from('pedidos_wa_compras_cola')
        .insert({ lote_id: lote.id, orden: i, nombre: file.name, storage_path: path })
      if (errIns) throw errIns
      encolados++
      // Desde el primero ya se puede ir procesando mientras sube el resto.
      if (encolados === 1) despertarWorkerCompras()
    } catch (e) {
      console.error('[compras-cola] no encolado', file.name, e)
      fallidos.push(file.name)
    }
    onProgreso?.(i + 1, files.length)
  }
  despertarWorkerCompras()
  return { encolados, fallidos }
}

/** Filas visibles de la cola (las cerradas con «Cerrar» se ocultan). */
export function useColaCompras() {
  return useQuery({
    queryKey: COLA_KEY,
    queryFn: async (): Promise<ItemColaDB[]> => {
      const { data, error } = await supabase
        .from('pedidos_wa_compras_cola')
        .select('id, lote_id, orden, nombre, estado, detalle, compra_id, proveedor, num_factura, total, holded_num, created_at')
        .eq('oculto', false)
        .order('created_at', { ascending: true })
        .order('orden', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []) as ItemColaDB[]
    },
    // Mientras haya trabajo, refresca cada 3 s; parada, no consulta más.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((it) => ESTADOS_COLA_ACTIVOS.includes(it.estado)) ? 3000 : false,
    refetchOnWindowFocus: true,
  })
}

export function useAccionesColaCompras() {
  const qc = useQueryClient()
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: COLA_KEY })
    qc.invalidateQueries({ queryKey: ['pedidos_wa', 'compras'] })
  }
  return {
    refrescar,
    cancelar: async () => {
      const { error } = await supabase
        .from('pedidos_wa_compras_cola')
        .update({ estado: 'cancelado', detalle: 'Cancelada antes de empezar' })
        .eq('estado', 'espera')
        .eq('oculto', false)
      if (error) throw error
      refrescar()
    },
    reintentarFallidas: async () => {
      const { error } = await supabase
        .from('pedidos_wa_compras_cola')
        .update({ estado: 'espera', detalle: null, intentos: 0, started_at: null })
        .in('estado', ['error', 'cancelado'])
        .eq('oculto', false)
      if (error) throw error
      despertarWorkerCompras()
      refrescar()
    },
    limpiar: async () => {
      const { error } = await supabase
        .from('pedidos_wa_compras_cola')
        .update({ oculto: true })
        .in('estado', ['ok', 'revisar', 'error', 'cancelado'])
        .eq('oculto', false)
      if (error) throw error
      refrescar()
    },
  }
}
