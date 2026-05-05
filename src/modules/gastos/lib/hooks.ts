import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────

export type Categoria = {
  id: string
  nombre: string
  color: string | null
  icon: string | null
  orden: number
  activo: boolean
}

export type ProveedorManual = {
  id: string
  nombre: string
  nif: string | null
  notas: string | null
}

export type ProveedorHolded = {
  id: string
  nombre: string
  nif: string | null
}

export type Fijo = {
  id: string
  nombre: string
  importe: number
  iva_pct: number
  dia_cargo: number
  categoria_id: string | null
  proveedor_holded_id: string | null
  proveedor_manual_id: string | null
  metodo_pago: string | null
  notas: string | null
  activo: boolean
}

export type FijoFormInput = Omit<Fijo, 'id'>

export type CalendarioRow = {
  fijo_id: string
  nombre: string
  importe: number
  iva_pct: number
  total: number
  dia_cargo: number
  fecha_cargo: string
  categoria_id: string | null
  categoria_nombre: string | null
  categoria_color: string | null
  proveedor: string
  metodo_pago: string | null
  pagado_at: string | null
  importe_real: number | null
  estado: 'pagado' | 'vencido' | 'proximo' | 'futuro'
}

export type Variable = {
  id: string
  fecha: string
  categoria_id: string | null
  proveedor_holded_id: string | null
  proveedor_manual_id: string | null
  proveedor_libre: string | null
  subtotal: number
  iva_pct: number
  total: number
  descripcion: string | null
  metodo_pago: string | null
  proveedor_holded_nombre: string | null
}

export type VariableFormInput = Omit<Variable, 'id' | 'total' | 'proveedor_holded_nombre'>

// ── Categorías ───────────────────────────────────────────────────────────────

export function useCategorias() {
  return useQuery({
    queryKey: ['gastos', 'categorias'] as const,
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase
        .from('gastos_categorias')
        .select('id, nombre, color, icon, orden, activo')
        .order('orden', { ascending: true })
      if (error) throw error
      return (data ?? []) as Categoria[]
    },
    staleTime: 5 * 60_000,
  })
}

export function useCategoriaCreate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { nombre: string; color?: string | null; orden?: number }) => {
      const { error } = await supabase.from('gastos_categorias').insert({
        nombre: input.nombre,
        color:  input.color ?? '#64748b',
        orden:  input.orden ?? 50,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos', 'categorias'] }),
  })
}

export function useCategoriaUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Categoria, 'nombre' | 'color' | 'orden' | 'activo'>> }) => {
      const { error } = await supabase.from('gastos_categorias').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos', 'categorias'] }),
  })
}

export function useCategoriaDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastos_categorias').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos'] }),
  })
}

// ── Proveedores ──────────────────────────────────────────────────────────────

export function useProveedoresManuales() {
  return useQuery({
    queryKey: ['gastos', 'proveedores-manuales'] as const,
    queryFn: async (): Promise<ProveedorManual[]> => {
      const { data, error } = await supabase
        .from('gastos_proveedores_manuales')
        .select('id, nombre, nif, notas')
        .order('nombre', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProveedorManual[]
    },
    staleTime: 5 * 60_000,
  })
}

export function useCreateProveedorManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { nombre: string; nif?: string | null; notas?: string | null }): Promise<ProveedorManual> => {
      const { data, error } = await supabase
        .from('gastos_proveedores_manuales')
        .insert({ nombre: input.nombre, nif: input.nif ?? null, notas: input.notas ?? null })
        .select('id, nombre, nif, notas')
        .single()
      if (error) throw error
      return data as ProveedorManual
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos', 'proveedores-manuales'] }),
  })
}

export function useProveedoresHoldedSearch(q: string) {
  const term = q.trim()
  return useQuery({
    queryKey: ['gastos', 'proveedores-holded', term] as const,
    enabled: term.length >= 2,
    queryFn: async (): Promise<ProveedorHolded[]> => {
      const { data, error } = await supabase
        .from('manager_contactos')
        .select('id, nombre, nif')
        .ilike('nombre', `%${term}%`)
        .order('nombre', { ascending: true })
        .limit(15)
      if (error) throw error
      return (data ?? []).map((r: any) => ({ id: r.id, nombre: r.nombre, nif: r.nif }))
    },
  })
}

export function useProveedorHoldedById(id: string | null | undefined) {
  return useQuery({
    queryKey: ['gastos', 'proveedor-holded', id ?? null] as const,
    enabled: !!id,
    queryFn: async (): Promise<ProveedorHolded | null> => {
      const { data, error } = await supabase
        .from('manager_contactos')
        .select('id, nombre, nif')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data as ProveedorHolded | null
    },
    staleTime: 60_000,
  })
}

// ── Fijos ────────────────────────────────────────────────────────────────────

export function useFijos() {
  return useQuery({
    queryKey: ['gastos', 'fijos'] as const,
    queryFn: async (): Promise<Fijo[]> => {
      const { data, error } = await supabase
        .from('gastos_fijos')
        .select('id, nombre, importe, iva_pct, dia_cargo, categoria_id, proveedor_holded_id, proveedor_manual_id, metodo_pago, notas, activo')
        .order('dia_cargo', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r: any): Fijo => ({
        ...r,
        importe: Number(r.importe),
        iva_pct: Number(r.iva_pct),
      }))
    },
  })
}

export function useCalendarioMes(anio: number, mes: number) {
  return useQuery({
    queryKey: ['gastos', 'calendario', anio, mes] as const,
    queryFn: async (): Promise<CalendarioRow[]> => {
      const { data, error } = await supabase.rpc('gastos_calendario_mes', { p_anio: anio, p_mes: mes })
      if (error) throw error
      return (data ?? []).map((r: any): CalendarioRow => ({
        fijo_id: r.fijo_id,
        nombre: r.nombre,
        importe: Number(r.importe),
        iva_pct: Number(r.iva_pct),
        total: Number(r.total),
        dia_cargo: Number(r.dia_cargo),
        fecha_cargo: r.fecha_cargo,
        categoria_id: r.categoria_id,
        categoria_nombre: r.categoria_nombre,
        categoria_color: r.categoria_color,
        proveedor: r.proveedor,
        metodo_pago: r.metodo_pago,
        pagado_at: r.pagado_at,
        importe_real: r.importe_real == null ? null : Number(r.importe_real),
        estado: r.estado,
      }))
    },
  })
}

export function useFijoCreate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: FijoFormInput) => {
      const { error } = await supabase.from('gastos_fijos').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] })
    },
  })
}

export function useFijoUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<FijoFormInput> }) => {
      const { error } = await supabase.from('gastos_fijos').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] })
    },
  })
}

export function useFijoDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastos_fijos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] })
    },
  })
}

export function useMarcarPagado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { fijo_id: string; anio: number; mes: number; importe_real?: number | null; notas?: string | null }) => {
      const { error } = await supabase
        .from('gastos_fijos_pagos')
        .upsert(
          {
            fijo_id: input.fijo_id,
            anio: input.anio,
            mes: input.mes,
            pagado_at: new Date().toISOString(),
            importe_real: input.importe_real ?? null,
            notas: input.notas ?? null,
          },
          { onConflict: 'fijo_id,anio,mes' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] })
    },
  })
}

export function useDesmarcarPagado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { fijo_id: string; anio: number; mes: number }) => {
      const { error } = await supabase
        .from('gastos_fijos_pagos')
        .delete()
        .eq('fijo_id', input.fijo_id)
        .eq('anio', input.anio)
        .eq('mes', input.mes)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] })
    },
  })
}

// ── Variables ────────────────────────────────────────────────────────────────

export type VariableFiltros = {
  from: string
  to: string
  categoria_id?: string | null
  q?: string
}

export function useVariables(f: VariableFiltros) {
  return useQuery({
    queryKey: ['gastos', 'variables', f.from, f.to, f.categoria_id ?? null, f.q ?? ''] as const,
    queryFn: async (): Promise<Variable[]> => {
      let q = supabase
        .from('gastos_variables')
        .select('id, fecha, categoria_id, proveedor_holded_id, proveedor_manual_id, proveedor_libre, subtotal, iva_pct, total, descripcion, metodo_pago, manager_contactos:proveedor_holded_id(nombre)')
        .gte('fecha', f.from)
        .lte('fecha', f.to)
        .order('fecha', { ascending: false })
      if (f.categoria_id) q = q.eq('categoria_id', f.categoria_id)
      if (f.q && f.q.trim().length > 0) q = q.or(`descripcion.ilike.%${f.q}%,proveedor_libre.ilike.%${f.q}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((r: any): Variable => ({
        id: r.id,
        fecha: r.fecha,
        categoria_id: r.categoria_id,
        proveedor_holded_id: r.proveedor_holded_id,
        proveedor_manual_id: r.proveedor_manual_id,
        proveedor_libre: r.proveedor_libre,
        descripcion: r.descripcion,
        metodo_pago: r.metodo_pago,
        subtotal: Number(r.subtotal),
        iva_pct: Number(r.iva_pct),
        total: Number(r.total),
        proveedor_holded_nombre: r.manager_contactos?.nombre ?? null,
      }))
    },
  })
}

export function useVariableCreate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: VariableFormInput) => {
      const { error } = await supabase.from('gastos_variables').insert(input)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos'] }),
  })
}

export function useVariableUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<VariableFormInput> }) => {
      const { error } = await supabase.from('gastos_variables').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos'] }),
  })
}

export function useVariableDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastos_variables').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos'] }),
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function calcularTotal(subtotal: number, iva_pct: number): number {
  return Math.round(subtotal * (1 + iva_pct / 100) * 100) / 100
}

// ── Stats ────────────────────────────────────────────────────────────────────

export type GastoUnificado = {
  fecha: string                  // ISO date YYYY-MM-DD (variables) o YYYY-MM-01 (fijos)
  anio: number
  mes: number
  tipo: 'fijo' | 'variable'
  total: number
  categoria_id: string | null
  categoria_nombre: string | null
  categoria_color: string | null
  proveedor: string
  proveedor_clave: string
}

export function useGastosUnificados(from: string, to: string) {
  return useQuery({
    queryKey: ['gastos', 'unificados', from, to] as const,
    queryFn: async (): Promise<GastoUnificado[]> => {
      // Fijos pagados en el rango (vía RPC)
      const fijosResp = await supabase.rpc('gastos_fijos_pagos_detalle', { p_from: from, p_to: to })
      if (fijosResp.error) throw fijosResp.error
      const fijos: GastoUnificado[] = (fijosResp.data ?? []).map((r: any): GastoUnificado => ({
        fecha: `${r.anio}-${String(r.mes).padStart(2, '0')}-01`,
        anio: Number(r.anio),
        mes: Number(r.mes),
        tipo: 'fijo',
        total: Number(r.total),
        categoria_id: r.categoria_id,
        categoria_nombre: r.categoria_nombre,
        categoria_color: r.categoria_color,
        proveedor: r.proveedor,
        proveedor_clave: r.proveedor_clave,
      }))

      // Variables (con embed para nombre Holded y categoría)
      const varsResp = await supabase
        .from('gastos_variables')
        .select(`
          fecha, total, categoria_id, proveedor_holded_id, proveedor_manual_id, proveedor_libre,
          gastos_categorias:categoria_id(nombre, color),
          manager_contactos:proveedor_holded_id(nombre),
          gastos_proveedores_manuales:proveedor_manual_id(nombre)
        `)
        .gte('fecha', from)
        .lte('fecha', to)
      if (varsResp.error) throw varsResp.error
      const variables: GastoUnificado[] = (varsResp.data ?? []).map((r: any): GastoUnificado => {
        const provHolded = r.manager_contactos?.nombre ?? null
        const provManual = r.gastos_proveedores_manuales?.nombre ?? null
        const proveedor  = provHolded ?? provManual ?? r.proveedor_libre ?? '—'
        const proveedor_clave =
          r.proveedor_holded_id ??
          (r.proveedor_manual_id ? `m:${r.proveedor_manual_id}` : null) ??
          (r.proveedor_libre ? `l:${r.proveedor_libre}` : '_sin')
        const d: Date = new Date(r.fecha)
        return {
          fecha: r.fecha,
          anio: d.getUTCFullYear(),
          mes: d.getUTCMonth() + 1,
          tipo: 'variable',
          total: Number(r.total),
          categoria_id: r.categoria_id,
          categoria_nombre: r.gastos_categorias?.nombre ?? null,
          categoria_color: r.gastos_categorias?.color ?? null,
          proveedor,
          proveedor_clave,
        }
      })

      return [...fijos, ...variables]
    },
  })
}

export type SerieMensualRow = {
  anio: number
  mes: number
  mes_iso: string
  fijos_total: number
  variables_total: number
  total: number
}

export function useSerieMensual(meses: number = 12) {
  return useQuery({
    queryKey: ['gastos', 'serie-mensual', meses] as const,
    queryFn: async (): Promise<SerieMensualRow[]> => {
      const { data, error } = await supabase.rpc('gastos_serie_mensual', { p_meses: meses })
      if (error) throw error
      return (data ?? []).map((r: any): SerieMensualRow => ({
        anio: Number(r.anio),
        mes:  Number(r.mes),
        mes_iso: r.mes_iso,
        fijos_total: Number(r.fijos_total),
        variables_total: Number(r.variables_total),
        total: Number(r.total),
      }))
    },
  })
}
