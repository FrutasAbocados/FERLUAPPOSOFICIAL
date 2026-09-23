// Cálculo puro de gastos fijos (sin imports de app: lo usan los tests con node --test).
// Misma fórmula que la vista SQL `gastos_fijos_mensual`.

export type Periodicidad = 'mensual' | 'trimestral' | 'semestral' | 'anual'
export type EstadoDato = 'confirmado' | 'pendiente_confirmar' | 'estimacion' | 'pendiente_introducir'
export type Naturaleza = 'fijo' | 'variable'
export type GrupoResumen = 'nominas' | 'socios' | 'prestamos' | 'vehiculos' | 'seguros' | 'software' | 'otros'

export const MESES_PERIODO: Record<Periodicidad, number> = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
}

export const PERIODICIDADES: { value: Periodicidad; label: string }[] = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
]

export const ESTADOS_DATO: { value: EstadoDato; label: string; chip: string }[] = [
  { value: 'confirmado', label: 'Confirmado', chip: 'ao-chip-mint' },
  { value: 'pendiente_confirmar', label: 'Pendiente de confirmar', chip: 'ao-chip-amber' },
  { value: 'estimacion', label: 'Estimación', chip: 'ao-chip-sky' },
  { value: 'pendiente_introducir', label: 'Pendiente de introducir', chip: 'ao-chip-coral' },
]

export const GRUPOS_RESUMEN: { value: GrupoResumen; label: string }[] = [
  { value: 'nominas', label: 'Nóminas' },
  { value: 'socios', label: 'Socios' },
  { value: 'prestamos', label: 'Préstamos' },
  { value: 'vehiculos', label: 'Vehículos' },
  { value: 'seguros', label: 'Seguros' },
  { value: 'software', label: 'Software' },
  { value: 'otros', label: 'Otros' },
]

export interface GastoCalculable {
  importe: number | null
  comision: number
  periodicidad: Periodicidad
  activo: boolean
  fecha_inicio: string | null
  fecha_fin: string | null
}

const redondear = (n: number) => Math.round(n * 100) / 100

/** Importe + comisión del periodo. */
export const totalPeriodo = (g: Pick<GastoCalculable, 'importe' | 'comision'>): number =>
  redondear(Number(g.importe ?? 0) + Number(g.comision ?? 0))

/** Equivalente mensual: (importe + comisión) / meses del periodo. */
export const mensualEquivalente = (g: Pick<GastoCalculable, 'importe' | 'comision' | 'periodicidad'>): number =>
  redondear(totalPeriodo(g) / MESES_PERIODO[g.periodicidad])

/** Cuenta en el total: activo y vigente en `hoy` (YYYY-MM-DD). */
export const computa = (g: GastoCalculable, hoy: string): boolean =>
  g.activo
  && (g.fecha_inicio == null || g.fecha_inicio <= hoy)
  && (g.fecha_fin == null || g.fecha_fin >= hoy)

export interface ConGrupo extends GastoCalculable {
  categoria_id: string | null
  grupo_resumen: GrupoResumen
}

export interface Resumen {
  total: number
  porGrupo: Record<GrupoResumen, number>
  porCategoria: Map<string | null, number>
}

export function resumir(gastos: ConGrupo[], hoy: string): Resumen {
  const porGrupo = Object.fromEntries(GRUPOS_RESUMEN.map(g => [g.value, 0])) as Record<GrupoResumen, number>
  const porCategoria = new Map<string | null, number>()
  let total = 0
  for (const g of gastos) {
    if (!computa(g, hoy)) continue
    const m = mensualEquivalente(g)
    total += m
    porGrupo[g.grupo_resumen] += m
    porCategoria.set(g.categoria_id, (porCategoria.get(g.categoria_id) ?? 0) + m)
  }
  for (const k of Object.keys(porGrupo) as GrupoResumen[]) porGrupo[k] = redondear(porGrupo[k])
  for (const [k, v] of porCategoria) porCategoria.set(k, redondear(v))
  return { total: redondear(total), porGrupo, porCategoria }
}

/** Acepta "1.500,50", "1500.5" o "" (→ null). Devuelve NaN si no es número válido. */
export function parseImporte(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  return Number(normal)
}
