import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { type ClienteSegmentacion, segmentarClientes } from '@/shared/lib/clientes-segmentacion'

// ── Tipos ────────────────────────────────────────────────────────────────────

type DbRow = Record<string, unknown>

const str = (v: unknown): string => String(v ?? '')
const nullableStr = (v: unknown): string | null => v == null ? null : String(v)
const num = (v: unknown): number => Number(v ?? 0)
const nullableNum = (v: unknown): number | null => v == null ? null : Number(v)

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

export type ClienteABC = ClienteFila & ClienteSegmentacion

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
  en_pausa_desde: string | null
  en_pausa_hasta: string | null
  notas: string | null
  updated_at: string
}

/**
 * Misma regla que la función SQL `cliente_en_pausa`: solo hasta → pausa hasta esa
 * fecha; solo desde → pausa indefinida; ambas → rango inclusive.
 */
export function enPausa(desde: string | null, hasta: string | null, hoy: string): boolean {
  if (!desde && !hasta) return false
  if (desde && hoy < desde) return false
  if (hasta && hoy > hasta) return false
  return true
}

export type ClienteProgramaRow = {
  contact_name_canon: string
  programa_manual: string | null
  estado: 'activo' | 'seguimiento' | 'pausado' | 'cerrado'
  prioridad: 'baja' | 'media' | 'alta'
  proxima_accion: string | null
  proxima_accion_fecha: string | null
  ultimo_contacto_at: string | null
  ultimo_contacto_tipo: 'llamada' | 'whatsapp' | 'visita' | 'nota' | null
  responsable: string | null
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
  en_pausa_desde: string | null
  en_pausa_hasta: string | null
  estado: 'pidiendo' | 'sin_pedir' | 'pausa'
}

// ── BBDD lista ───────────────────────────────────────────────────────────────

export async function fetchClientesBBDD(from: string, to: string): Promise<ClienteABC[]> {
  const { data, error } = await supabase.rpc('manager_clientes_lista', { p_from: from, p_to: to })
  if (error) throw error
  const rows: ClienteFila[] = ((data ?? []) as DbRow[]).map((r): ClienteFila => ({
    contact_name_canon: str(r.contact_name_canon),
    docs:               num(r.docs),
    ventas:             num(r.ventas),
    margen:             num(r.margen),
    margen_pct:         nullableNum(r.margen_pct),
    pendiente:          num(r.pendiente_cobro ?? r.pendiente),
    ultima_compra:      nullableStr(r.ultima_compra),
    num_aliases:        num(r.num_aliases),
  }))
  return segmentarClientes(rows).sort((a, b) => b.margen - a.margen)
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
      return ((data ?? []) as DbRow[]).map((r): ClienteFactura => ({
        id: str(r.id),
        doc_number: nullableStr(r.doc_number),
        subtipo: nullableStr(r.subtipo),
        fecha: str(r.fecha),
        subtotal: num(r.subtotal),
        total: num(r.total),
        payments_pending: num(r.payments_pending),
        status: nullableStr(r.status),
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
      return ((data ?? []) as DbRow[]).map((r): ClienteProductoFila => ({
        product_id: nullableStr(r.product_id),
        nombre: str(r.nombre),
        veces: num(r.veces),
        unidades: num(r.unidades),
        ventas_subtotal: num(r.ventas_subtotal),
        cogs: num(r.cogs),
        margen: num(r.margen),
        margen_pct: nullableNum(r.margen_pct),
        ultima_compra: nullableStr(r.ultima_compra),
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
        .select('contact_name_canon, hora_preferida, dia_preferido, tags, en_pausa_desde, en_pausa_hasta, notas, updated_at')
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

// ── Programa fidelizacion ───────────────────────────────────────────────────

export function useClientePrograma(name: string | null) {
  return useQuery({
    queryKey: ['clientes', 'programa', name] as const,
    enabled: !!name,
    queryFn: async (): Promise<ClienteProgramaRow | null> => {
      if (!name) return null
      const { data, error } = await supabase
        .from('clientes_programa')
        .select('contact_name_canon, programa_manual, estado, prioridad, proxima_accion, proxima_accion_fecha, ultimo_contacto_at, ultimo_contacto_tipo, responsable, notas, updated_at')
        .eq('contact_name_canon', name)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as ClienteProgramaRow | null
    },
  })
}

export function useSetClientePrograma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { contact_name_canon: string; patch: Partial<Omit<ClienteProgramaRow, 'contact_name_canon' | 'updated_at'>> }) => {
      const { error } = await supabase
        .from('clientes_programa')
        .upsert({
          contact_name_canon: input.contact_name_canon,
          ...input.patch,
        }, { onConflict: 'contact_name_canon' })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['clientes', 'programa', vars.contact_name_canon] })
      qc.invalidateQueries({ queryKey: ['clientes', 'bbdd'] })
      qc.invalidateQueries({ queryKey: ['manager', 'clientes'] })
    },
  })
}

export function useMarcarClienteContacto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      contact_name_canon: string
      tipo: NonNullable<ClienteProgramaRow['ultimo_contacto_tipo']>
      proxima_accion?: string | null
      proxima_accion_fecha?: string | null
    }) => {
      const { error } = await supabase
        .from('clientes_programa')
        .upsert({
          contact_name_canon: input.contact_name_canon,
          estado: 'seguimiento',
          ultimo_contacto_at: new Date().toISOString(),
          ultimo_contacto_tipo: input.tipo,
          proxima_accion: input.proxima_accion ?? null,
          proxima_accion_fecha: input.proxima_accion_fecha ?? null,
        }, { onConflict: 'contact_name_canon' })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['clientes', 'programa', vars.contact_name_canon] })
      qc.invalidateQueries({ queryKey: ['clientes', 'bbdd'] })
      qc.invalidateQueries({ queryKey: ['manager', 'clientes'] })
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

// ── Sesión 2: evolución mensual + heatmap + márgenes detallados ──────────────

export type EvolucionMensualRow = {
  mes_iso: string
  anio: number
  mes: number
  docs: number
  ventas: number
  cogs: number
  margen: number
  margen_pct: number | null
}

export function useClienteEvolucionMensual(name: string | null, meses: number = 12) {
  return useQuery({
    queryKey: ['clientes', 'evolucion', name, meses] as const,
    enabled: !!name,
    queryFn: async (): Promise<EvolucionMensualRow[]> => {
      if (!name) return []
      const { data, error } = await supabase.rpc('manager_cliente_evolucion_mensual', {
        p_contact_name_canon: name, p_meses: meses,
      })
      if (error) throw error
      return ((data ?? []) as DbRow[]).map((r): EvolucionMensualRow => ({
        mes_iso: str(r.mes_iso),
        anio: num(r.anio),
        mes: num(r.mes),
        docs: num(r.docs),
        ventas: num(r.ventas),
        cogs: num(r.cogs),
        margen: num(r.margen),
        margen_pct: nullableNum(r.margen_pct),
      }))
    },
    staleTime: 5 * 60_000,
  })
}

export type HeatmapDiaRow = {
  fecha: string
  pedidos: number
  ventas: number
}

export function useClienteHeatmap(name: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ['clientes', 'heatmap', name, from, to] as const,
    enabled: !!name,
    queryFn: async (): Promise<HeatmapDiaRow[]> => {
      if (!name) return []
      const { data, error } = await supabase.rpc('manager_cliente_heatmap_dia', {
        p_contact_name_canon: name, p_from: from, p_to: to,
      })
      if (error) throw error
      return ((data ?? []) as DbRow[]).map((r): HeatmapDiaRow => ({
        fecha: str(r.fecha),
        pedidos: num(r.pedidos),
        ventas: num(r.ventas),
      }))
    },
    staleTime: 5 * 60_000,
  })
}

export type MargenDetalleRow = {
  product_id: string
  nombre: string
  unidades: number
  ventas_subtotal: number
  cogs: number
  margen: number
  margen_pct: number | null
  margen_pct_global: number | null
  delta_pp: number | null
}

export function useClienteMargenDetalle(name: string | null, from: string, to: string, limit: number = 20) {
  return useQuery({
    queryKey: ['clientes', 'margen-detalle', name, from, to, limit] as const,
    enabled: !!name,
    queryFn: async (): Promise<MargenDetalleRow[]> => {
      if (!name) return []
      const { data, error } = await supabase.rpc('manager_cliente_margen_detalle', {
        p_contact_name_canon: name, p_from: from, p_to: to, p_limit: limit,
      })
      if (error) throw error
      return ((data ?? []) as DbRow[]).map((r): MargenDetalleRow => ({
        product_id: str(r.product_id),
        nombre: str(r.nombre),
        unidades: num(r.unidades),
        ventas_subtotal: num(r.ventas_subtotal),
        cogs: num(r.cogs),
        margen: num(r.margen),
        margen_pct: nullableNum(r.margen_pct),
        margen_pct_global: nullableNum(r.margen_pct_global),
        delta_pp: nullableNum(r.delta_pp),
      }))
    },
    staleTime: 5 * 60_000,
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
      for (const r of (data ?? []) as DbRow[]) {
        const k = str(r.contact_name)
        const cur = map.get(k) ?? { docs: 0, total: 0 }
        cur.docs += 1
        cur.total += num(r.total)
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

// ── Seguimiento (legacy) ──────────────────────────────────────────────────────

export async function fetchClientesSeguimiento(diasUmbral: number, diasActivo: number): Promise<SeguimientoFila[]> {
  const { data, error } = await supabase.rpc('clientes_seguimiento_semanal', {
    p_dias_umbral: diasUmbral, p_dias_activo: diasActivo,
  })
  if (error) throw error
  return ((data ?? []) as DbRow[]).map((r): SeguimientoFila => ({
    contact_name_canon: str(r.contact_name_canon),
    ult_pedido: str(r.ult_pedido),
    dias_sin_pedir: num(r.dias_sin_pedir),
    cadencia_dias: nullableNum(r.cadencia_dias),
    pedidos_activo: num(r.pedidos_activo),
    ventas_activo: num(r.ventas_activo),
    en_pausa_desde: nullableStr(r.en_pausa_desde),
    en_pausa_hasta: nullableStr(r.en_pausa_hasta),
    estado: str(r.estado) as SeguimientoFila['estado'],
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

// ── Seguimiento v2 ────────────────────────────────────────────────────────────

export type SeguimientoFilaV2 = {
  contact_name_canon: string
  ult_pedido: string
  dias_sin_pedir: number
  cadencia_dias: number | null
  pedidos_activo: number
  ventas_activo: number
  llamado_seguimiento_at: string | null
}

export type ExcluidoFila = {
  contact_name_canon: string
  motivo_exclusion: string | null
  excluido_at: string
}

export function seguimientoV2QueryKey(diasActivo: number) {
  return ['clientes', 'seguimiento-v2', diasActivo] as const
}

export async function fetchClientesSeguimientoV2(diasActivo: number): Promise<SeguimientoFilaV2[]> {
  const { data, error } = await supabase.rpc('clientes_seguimiento_v2', { p_dias_activo: diasActivo })
  if (error) throw error
  return ((data ?? []) as DbRow[]).map((r): SeguimientoFilaV2 => ({
    contact_name_canon: str(r.contact_name_canon),
    ult_pedido: str(r.ult_pedido),
    dias_sin_pedir: num(r.dias_sin_pedir),
    cadencia_dias: nullableNum(r.cadencia_dias),
    pedidos_activo: num(r.pedidos_activo),
    ventas_activo: num(r.ventas_activo),
    llamado_seguimiento_at: nullableStr(r.llamado_seguimiento_at),
  }))
}

export function useClientesSeguimientoV2(diasActivo = 90) {
  return useQuery({
    queryKey: seguimientoV2QueryKey(diasActivo),
    queryFn: () => fetchClientesSeguimientoV2(diasActivo),
    staleTime: 3 * 60_000,
  })
}

export function useClientesSeguimientoExcluidos() {
  return useQuery({
    queryKey: ['clientes', 'seguimiento-excluidos'] as const,
    queryFn: async (): Promise<ExcluidoFila[]> => {
      const { data, error } = await supabase.rpc('clientes_seguimiento_excluidos')
      if (error) throw error
      return ((data ?? []) as DbRow[]).map((r): ExcluidoFila => ({
        contact_name_canon: str(r.contact_name_canon),
        motivo_exclusion: nullableStr(r.motivo_exclusion),
        excluido_at: str(r.excluido_at),
      }))
    },
    staleTime: 5 * 60_000,
  })
}

export function useSeguimientoExcluir() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, motivo }: { name: string; motivo: string | null }) => {
      const { error } = await supabase.rpc('seguimiento_excluir', { p_name: name, p_motivo: motivo })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes', 'seguimiento-v2'] })
      qc.invalidateQueries({ queryKey: ['clientes', 'seguimiento-excluidos'] })
    },
  })
}

export function useSeguimientoRestaurar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.rpc('seguimiento_restaurar', { p_name: name })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes', 'seguimiento-v2'] })
      qc.invalidateQueries({ queryKey: ['clientes', 'seguimiento-excluidos'] })
    },
  })
}

export function useSeguimientoLlamado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.rpc('seguimiento_marcar_llamado', { p_name: name })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes', 'seguimiento-v2'] })
    },
  })
}
