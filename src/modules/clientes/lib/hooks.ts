import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────

export type ClienteFila = {
  contact_name_canon: string
  docs: number
  ventas: number
  margen: number
  margen_pct: number | null
  pendiente: number
  ultima_compra: string | null
  num_aliases: number
}

export type ClienteABC = ClienteFila & { clase: 'A' | 'B' | 'C' }

export type ClienteFactura = {
  id: string
  doc_number: string | null
  subtipo: string | null
  fecha: string
  subtotal: number
  total: number
  payments_pending: number
  status: string | null
}

export type ClienteProductoFila = {
  product_id: string | null
  nombre: string
  veces: number
  unidades: number
  ventas_subtotal: number
  cogs: number
  margen: number
  margen_pct: number | null
  ultima_compra: string | null
}

export type Preferencias = {
  contact_name_canon: string
  hora_preferida: string | null
  dia_preferido: string | null
  tags: string[]
  en_pausa_hasta: string | null
  notas: string | null
  updated_at: string
}

export type NotaInterna = {
  id: string
  contact_name_canon: string
  autor: string | null
  texto: string
  created_at: string
}

export type SeguimientoFila = {
  contact_name_canon: string
  ult_pedido: string
  dias_sin_pedir: number
  cadencia_dias: number | null
  pedidos_activo: number
  ventas_activo: number
  en_pausa_hasta: string | null
  estado: 'pidiendo' | 'sin_pedir' | 'pausa'
}

// ── BBDD lista (con ABC frontend Pareto 70/90) ───────────────────────────────

export async function fetchClientesBBDD(from: string, to: string): Promise<ClienteABC[]> {
  const { data, error } = await supabase.rpc('manager_clientes_lista', { p_from: from, p_to: to })
  if (error) throw error
  const rows: ClienteFila[] = (data ?? []).map((r: any): ClienteFila => ({
    contact_name_canon: r.contact_name_canon,
    docs:               Number(r.docs ?? 0),
    ventas:             Number(r.ventas ?? 0),
    margen:             Number(r.margen ?? 0),
    margen_pct:         r.margen_pct == null ? null : Number(r.margen_pct),
    pendiente:          Number(r.pendiente ?? 0),
    ultima_compra:      r.ultima_compra,
    num_aliases:        Number(r.num_aliases ?? 0),
  }))
  const totalMargen = rows.reduce((s, r) => s + Math.max(r.margen, 0), 0)
  const sorted = [...rows].sort((a, b) => b.margen - a.margen)
  let acc = 0
  return sorted.map((r): ClienteABC => {
    const pos = totalMargen > 0 ? acc / totalMargen : 0
    acc += Math.max(r.margen, 0)
    const clase: 'A' | 'B' | 'C' = pos < 0.7 ? 'A' : pos < 0.9 ? 'B' : 'C'
    return { ...r, clase }
  })
}

export function clientesBBDDQueryKey(from: string, to: string) {
  return ['clientes', 'bbdd', from, to] as const
}

export function useClientesBBDD(from: string, to: string) {
  return useQuery({
    queryKey: clientesBBDDQueryKey(from, to),
    queryFn: () => fetchClientesBBDD(from, to),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })
}

// ── Detalle cliente ──────────────────────────────────────────────────────────

export function useClienteFacturas(name: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ['clientes', 'facturas', name, from, to] as const,
    enabled: !!name,
    queryFn: async (): Promise<ClienteFactura[]> => {
      const { data, error } = await supabase.rpc('manager_cliente_facturas', {
        p_contact_name_canon: name, p_from: from, p_to: to,
      })
      if (error) throw error
      return (data ?? []).map((r: any): ClienteFactura => ({
        id: r.id,
        doc_number: r.doc_number,
        subtipo: r.subtipo,
        fecha: r.fecha,
        subtotal: Number(r.subtotal ?? 0),
        total: Number(r.total ?? 0),
        payments_pending: Number(r.payments_pending ?? 0),
        status: r.status,
      }))
    },
  })
}

export function useClienteProductos(name: string | null, from: string, to: string, limit = 30) {
  return useQuery({
    queryKey: ['clientes', 'productos', name, from, to, limit] as const,
    enabled: !!name,
    queryFn: async (): Promise<ClienteProductoFila[]> => {
      const { data, error } = await supabase.rpc('manager_cliente_productos', {
        p_contact_name_canon: name, p_from: from, p_to: to, p_limit: limit,
      })
      if (error) throw error
      return (data ?? []).map((r: any): ClienteProductoFila => ({
        product_id: r.product_id,
        nombre: r.nombre,
        veces: Number(r.veces ?? 0),
        unidades: Number(r.unidades ?? 0),
        ventas_subtotal: Number(r.ventas_subtotal ?? 0),
        cogs: Number(r.cogs ?? 0),
        margen: Number(r.margen ?? 0),
        margen_pct: r.margen_pct == null ? null : Number(r.margen_pct),
        ultima_compra: r.ultima_compra,
      }))
    },
  })
}

// ── Preferencias ─────────────────────────────────────────────────────────────

export function usePreferencias(name: string | null) {
  return useQuery({
    queryKey: ['clientes', 'prefs', name] as const,
    enabled: !!name,
    queryFn: async (): Promise<Preferencias | null> => {
      if (!name) return null
      const { data, error } = await supabase
        .from('clientes_preferencias')
        .select('contact_name_canon, hora_preferida, dia_preferido, tags, en_pausa_hasta, notas, updated_at')
        .eq('contact_name_canon', name)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as Preferencias | null
    },
  })
}

export function useSetPreferencias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { contact_name_canon: string; patch: Partial<Omit<Preferencias, 'contact_name_canon' | 'updated_at'>> }) => {
      const { error } = await supabase
        .from('clientes_preferencias')
        .upsert({
          contact_name_canon: input.contact_name_canon,
          ...input.patch,
        }, { onConflict: 'contact_name_canon' })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['clientes', 'prefs', vars.contact_name_canon] })
      qc.invalidateQueries({ queryKey: ['clientes', 'seguimiento'] })
    },
  })
}

// ── Notas internas ───────────────────────────────────────────────────────────

export function useNotas(name: string | null) {
  return useQuery({
    queryKey: ['clientes', 'notas', name] as const,
    enabled: !!name,
    queryFn: async (): Promise<NotaInterna[]> => {
      if (!name) return []
      const { data, error } = await supabase
        .from('clientes_notas_internas')
        .select('id, contact_name_canon, autor, texto, created_at')
        .eq('contact_name_canon', name)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as NotaInterna[]
    },
  })
}

export function useAddNota() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { contact_name_canon: string; texto: string }) => {
      const { error } = await supabase
        .from('clientes_notas_internas')
        .insert({ contact_name_canon: input.contact_name_canon, texto: input.texto })
      if (error) throw error
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['clientes', 'notas', vars.contact_name_canon] }),
  })
}

export function useDeleteNota() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes_notas_internas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes', 'notas'] }),
  })
}

// ── Aliases (unificar duplicados Holded) ─────────────────────────────────────

export type AliasRow = {
  id: string
  alias_from: string
  alias_to: string
  created_at: string
}

export function useAliasesDe(name: string | null) {
  return useQuery({
    queryKey: ['clientes', 'aliases-de', name] as const,
    enabled: !!name,
    queryFn: async (): Promise<AliasRow[]> => {
      if (!name) return []
      const { data, error } = await supabase
        .from('manager_clientes_alias')
        .select('id, alias_from, alias_to, created_at')
        .eq('alias_to', name)
        .order('alias_from')
      if (error) throw error
      return (data ?? []) as AliasRow[]
    },
  })
}

/** Busca nombres en manager_facturas que se parezcan (para detectar duplicados). */
export function useNombresParecidos(q: string) {
  const term = q.trim()
  return useQuery({
    queryKey: ['clientes', 'parecidos', term] as const,
    enabled: term.length >= 2,
    queryFn: async (): Promise<Array<{ contact_name: string; docs: number; total: number }>> => {
      const { data, error } = await supabase
        .from('manager_facturas')
        .select('contact_name, total')
        .ilike('contact_name', `%${term}%`)
        .not('contact_name', 'is', null)
        .limit(500)
      if (error) throw error
      const map = new Map<string, { docs: number; total: number }>()
      for (const r of (data ?? []) as any[]) {
        const k = r.contact_name as string
        const cur = map.get(k) ?? { docs: 0, total: 0 }
        cur.docs += 1
        cur.total += Number(r.total ?? 0)
        map.set(k, cur)
      }
      return Array.from(map.entries())
        .map(([contact_name, v]) => ({ contact_name, docs: v.docs, total: v.total }))
        .sort((a, b) => b.docs - a.docs)
        .slice(0, 30)
    },
  })
}

export function useAddAliasCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { alias_from: string; alias_to: string }) => {
      const { error } = await supabase
        .from('manager_clientes_alias')
        .insert({ alias_from: input.alias_from.trim(), alias_to: input.alias_to.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['manager'] })
    },
  })
}

export function useDeleteAliasCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('manager_clientes_alias').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['manager'] })
    },
  })
}

// ── Seguimiento ──────────────────────────────────────────────────────────────

export async function fetchClientesSeguimiento(diasUmbral: number, diasActivo: number): Promise<SeguimientoFila[]> {
  const { data, error } = await supabase.rpc('clientes_seguimiento_semanal', {
    p_dias_umbral: diasUmbral, p_dias_activo: diasActivo,
  })
  if (error) throw error
  return (data ?? []).map((r: any): SeguimientoFila => ({
    contact_name_canon: r.contact_name_canon,
    ult_pedido: r.ult_pedido,
    dias_sin_pedir: Number(r.dias_sin_pedir ?? 0),
    cadencia_dias: r.cadencia_dias == null ? null : Number(r.cadencia_dias),
    pedidos_activo: Number(r.pedidos_activo ?? 0),
    ventas_activo: Number(r.ventas_activo ?? 0),
    en_pausa_hasta: r.en_pausa_hasta,
    estado: r.estado,
  }))
}

export function clientesSeguimientoQueryKey(diasUmbral: number, diasActivo: number) {
  return ['clientes', 'seguimiento', diasUmbral, diasActivo] as const
}

export function useClientesSeguimiento(diasUmbral: number = 7, diasActivo: number = 90) {
  return useQuery({
    queryKey: clientesSeguimientoQueryKey(diasUmbral, diasActivo),
    queryFn: () => fetchClientesSeguimiento(diasUmbral, diasActivo),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })
}
