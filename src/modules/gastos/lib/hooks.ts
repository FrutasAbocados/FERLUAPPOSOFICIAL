import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────

type DbRow = Record<string, unknown>

const str = (v: unknown): string => String(v ?? '')
const nullableStr = (v: unknown): string | null => v == null ? null : String(v)
const num = (v: unknown): number => Number(v ?? 0)

function nestedString(row: DbRow, key: string, prop: string): string | null {
  const value = row[key]
  if (!value || typeof value !== 'object') return null
  const nested = Array.isArray(value) ? value[0] : value
  if (!nested || typeof nested !== 'object') return null
  return nullableStr((nested as DbRow)[prop])
}

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
      return ((data ?? []) as DbRow[]).map((r): ProveedorHolded => ({
        id: str(r.id),
        nombre: str(r.nombre),
        nif: nullableStr(r.nif),
      }))
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
      return ((data ?? []) as DbRow[]).map((r): Fijo => ({
        id: str(r.id),
        nombre: str(r.nombre),
        importe: num(r.importe),
        iva_pct: num(r.iva_pct),
        dia_cargo: num(r.dia_cargo),
        categoria_id: nullableStr(r.categoria_id),
        proveedor_holded_id: nullableStr(r.proveedor_holded_id),
        proveedor_manual_id: nullableStr(r.proveedor_manual_id),
        metodo_pago: nullableStr(r.metodo_pago),
        notas: nullableStr(r.notas),
        activo: Boolean(r.activo),
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
      return ((data ?? []) as DbRow[]).map((r): CalendarioRow => ({
        fijo_id: str(r.fijo_id),
        nombre: str(r.nombre),
        importe: num(r.importe),
        iva_pct: num(r.iva_pct),
        total: num(r.total),
        dia_cargo: num(r.dia_cargo),
        fecha_cargo: str(r.fecha_cargo),
        categoria_id: nullableStr(r.categoria_id),
        categoria_nombre: nullableStr(r.categoria_nombre),
        categoria_color: nullableStr(r.categoria_color),
        proveedor: str(r.proveedor),
        metodo_pago: nullableStr(r.metodo_pago),
        pagado_at: nullableStr(r.pagado_at),
        importe_real: r.importe_real == null ? null : num(r.importe_real),
        estado: str(r.estado) as CalendarioRow['estado'],
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
      return ((data ?? []) as DbRow[]).map((r): Variable => ({
        id: str(r.id),
        fecha: str(r.fecha),
        categoria_id: nullableStr(r.categoria_id),
        proveedor_holded_id: nullableStr(r.proveedor_holded_id),
        proveedor_manual_id: nullableStr(r.proveedor_manual_id),
        proveedor_libre: nullableStr(r.proveedor_libre),
        descripcion: nullableStr(r.descripcion),
        metodo_pago: nullableStr(r.metodo_pago),
        subtotal: num(r.subtotal),
        iva_pct: num(r.iva_pct),
        total: num(r.total),
        proveedor_holded_nombre: nestedString(r, 'manager_contactos', 'nombre'),
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
      const fijos: GastoUnificado[] = ((fijosResp.data ?? []) as DbRow[]).map((r): GastoUnificado => ({
        fecha: `${str(r.anio)}-${str(r.mes).padStart(2, '0')}-01`,
        anio: num(r.anio),
        mes: num(r.mes),
        tipo: 'fijo',
        total: num(r.total),
        categoria_id: nullableStr(r.categoria_id),
        categoria_nombre: nullableStr(r.categoria_nombre),
        categoria_color: nullableStr(r.categoria_color),
        proveedor: str(r.proveedor),
        proveedor_clave: str(r.proveedor_clave),
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
      const variables: GastoUnificado[] = ((varsResp.data ?? []) as DbRow[]).map((r): GastoUnificado => {
        const provHolded = nestedString(r, 'manager_contactos', 'nombre')
        const provManual = nestedString(r, 'gastos_proveedores_manuales', 'nombre')
        const proveedor  = provHolded ?? provManual ?? nullableStr(r.proveedor_libre) ?? '—'
        const proveedor_clave =
          nullableStr(r.proveedor_holded_id) ??
          (r.proveedor_manual_id ? `m:${String(r.proveedor_manual_id)}` : null) ??
          (r.proveedor_libre ? `l:${String(r.proveedor_libre)}` : '_sin')
        const fecha = str(r.fecha)
        const d: Date = new Date(fecha)
        return {
          fecha,
          anio: d.getUTCFullYear(),
          mes: d.getUTCMonth() + 1,
          tipo: 'variable',
          total: num(r.total),
          categoria_id: nullableStr(r.categoria_id),
          categoria_nombre: nestedString(r, 'gastos_categorias', 'nombre'),
          categoria_color: nestedString(r, 'gastos_categorias', 'color'),
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
      return ((data ?? []) as DbRow[]).map((r): SerieMensualRow => ({
        anio: num(r.anio),
        mes:  num(r.mes),
        mes_iso: str(r.mes_iso),
        fijos_total: num(r.fijos_total),
        variables_total: num(r.variables_total),
        total: num(r.total),
      }))
    },
  })
}
