import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { UnidadLimpia } from './diccionario'
import { clave, type DiccionarioExtra, type LineaLimpia } from './engine'

/**
 * Memoria de la herramienta "Limpiar pedido para Excel".
 *
 * Lo que se corrige a mano en la tabla se guarda en Supabase y se aplica en los
 * pedidos siguientes, sin tocar código. El diccionario estático de
 * `diccionario.ts` queda como base de fábrica; esto se superpone y gana.
 */

/** Alias y formatos aprendidos, listos para pasarle al motor. */
export function useDiccionarioAprendido() {
  return useQuery({
    queryKey: ['pedidos_wa', 'limpieza', 'diccionario'] as const,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DiccionarioExtra> => {
      const [aliasRes, unidadRes] = await Promise.all([
        supabase.from('pedidos_wa_limpieza_aliases').select('alias, producto'),
        supabase.from('pedidos_wa_limpieza_unidades').select('producto, unidad'),
      ])
      if (aliasRes.error) throw aliasRes.error
      if (unidadRes.error) throw unidadRes.error

      const aliases: Record<string, string> = {}
      for (const r of aliasRes.data ?? []) aliases[r.alias] = r.producto

      const unidades: Record<string, UnidadLimpia> = {}
      for (const r of unidadRes.data ?? []) unidades[r.producto] = r.unidad as UnidadLimpia

      return { aliases, unidades }
    },
  })
}

export type Aprendizaje = {
  aliases: Array<{ alias: string; producto: string }>
  unidades: Array<{ producto: string; unidad: UnidadLimpia }>
}

/**
 * Compara una fila con cómo salió del parser y deduce qué hay que aprender.
 *
 * - Nombre cambiado → un alias por cada forma cruda en que se escribió.
 * - Unidad cambiada → sólo si NO venía escrita en el pedido. Si el texto decía
 *   "2 c melón" y se corrige a unidades, es un ajuste puntual: aprenderlo como
 *   formato habitual sería falsear los pedidos futuros, donde la "c" seguiría
 *   mandando igualmente.
 */
export function deducirAprendizaje(original: LineaLimpia, editada: LineaLimpia): Aprendizaje {
  const aprendizaje: Aprendizaje = { aliases: [], unidades: [] }
  const nombre = editada.producto.trim()
  if (!nombre) return aprendizaje

  if (nombre !== original.producto) {
    for (const k of original.clavesRaw) {
      if (k && k !== clave(nombre)) aprendizaje.aliases.push({ alias: k, producto: nombre })
    }
  }

  if (editada.unidad !== original.unidad && !original.unidadExplicita) {
    aprendizaje.unidades.push({ producto: clave(nombre), unidad: editada.unidad })
  }

  return aprendizaje
}

/** Guarda lo aprendido. Un alias ya conocido se actualiza y suma una vez más. */
export function useGuardarAprendizaje() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: Aprendizaje) => {
      if (a.aliases.length === 0 && a.unidades.length === 0) return
      if (a.aliases.length > 0) {
        const { error } = await supabase
          .from('pedidos_wa_limpieza_aliases')
          .upsert(a.aliases.map(x => ({ ...x, updated_at: new Date().toISOString() })), {
            onConflict: 'alias',
          })
        if (error) throw error
      }
      if (a.unidades.length > 0) {
        const { error } = await supabase
          .from('pedidos_wa_limpieza_unidades')
          .upsert(a.unidades.map(x => ({ ...x, updated_at: new Date().toISOString() })), {
            onConflict: 'producto',
          })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedidos_wa', 'limpieza', 'diccionario'] }),
  })
}
