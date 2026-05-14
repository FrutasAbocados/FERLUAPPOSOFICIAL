export type ClienteABCClase = 'A' | 'B' | 'C'

export type ClientePrograma =
  | 'vip'
  | 'riesgo'
  | 'deuda'
  | 'potencial'
  | 'rentable'
  | 'estandar'

export type ClienteSegmentacion = {
  clase: ClienteABCClase
  programa: ClientePrograma
  programaLabel: string
  accionSugerida: string
  loyaltyScore: number
}

export type ClienteSegmentable = {
  contact_name_canon: string
  docs: number
  ventas: number
  margen: number
  margen_pct: number | null
  ultima_compra: string | null
}

type SegmentInput = ClienteSegmentable & {
  pendiente?: number
  pendiente_cobro?: number
  dias_sin_pedir?: number | null
  cadencia_dias?: number | null
}

const PROGRAMA_META: Record<ClientePrograma, Pick<ClienteSegmentacion, 'programaLabel' | 'accionSugerida'>> = {
  vip: {
    programaLabel: 'VIP Oro',
    accionSugerida: 'Mantener trato preferente',
  },
  riesgo: {
    programaLabel: 'A Riesgo',
    accionSugerida: 'Llamar y revisar ultimo pedido',
  },
  deuda: {
    programaLabel: 'A Deuda',
    accionSugerida: 'Cuidar relacion y controlar credito',
  },
  potencial: {
    programaLabel: 'B Potencial',
    accionSugerida: 'Subir ticket con recomendacion',
  },
  rentable: {
    programaLabel: 'C Rentable',
    accionSugerida: 'Mantener servicio eficiente',
  },
  estandar: {
    programaLabel: 'Estandar',
    accionSugerida: 'Servicio normal',
  },
}

export function segmentarClientes<T extends SegmentInput>(rows: T[]): Array<T & ClienteSegmentacion> {
  const totalMargen = rows.reduce((sum, row) => sum + positive(row.margen), 0)
  const maxMargen = Math.max(...rows.map(row => positive(row.margen)), 0)
  const maxDocs = Math.max(...rows.map(row => positive(row.docs)), 0)
  const maxVentas = Math.max(...rows.map(row => positive(row.ventas)), 0)

  const sorted = [...rows].sort((a, b) => b.margen - a.margen)
  const clases = new Map<string, ClienteABCClase>()
  let acc = 0

  for (const row of sorted) {
    const pos = totalMargen > 0 ? acc / totalMargen : 1
    const clase: ClienteABCClase = pos < 0.7 ? 'A' : pos < 0.9 ? 'B' : 'C'
    clases.set(row.contact_name_canon, positive(row.margen) > 0 ? clase : 'C')
    acc += positive(row.margen)
  }

  return rows.map((row) => {
    const clase = clases.get(row.contact_name_canon) ?? 'C'
    const pendiente = getPendiente(row)
    const score = scoreCliente(row, { maxMargen, maxDocs, maxVentas, pendiente })
    const programa = programaCliente(row, clase, score, pendiente)
    return {
      ...row,
      clase,
      programa,
      loyaltyScore: score,
      ...PROGRAMA_META[programa],
    }
  })
}

function programaCliente(row: SegmentInput, clase: ClienteABCClase, score: number, pendiente: number): ClientePrograma {
  const ventas = positive(row.ventas)
  const deudaRatio = ventas > 0 ? pendiente / ventas : 0
  const diasSinComprar = daysSince(row.ultima_compra)
  const diasSinPedir = row.dias_sin_pedir ?? diasSinComprar
  const cadencia = row.cadencia_dias ?? null
  const margenPct = row.margen_pct ?? 0
  const rompeCadencia = cadencia != null && diasSinPedir != null && diasSinPedir >= Math.max(cadencia + 3, cadencia * 1.6)

  if (clase === 'A' && (pendiente >= 500 || deudaRatio >= 0.25)) return 'deuda'
  if (clase === 'A' && (rompeCadencia || (diasSinPedir != null && diasSinPedir >= 21))) return 'riesgo'
  if (clase === 'A') return 'vip'
  if (clase === 'B' && (score >= 58 || margenPct >= 22)) return 'potencial'
  if (clase === 'C' && row.margen > 0 && pendiente <= 0 && margenPct >= 22) return 'rentable'
  return 'estandar'
}

function scoreCliente(
  row: SegmentInput,
  ctx: { maxMargen: number; maxDocs: number; maxVentas: number; pendiente: number },
): number {
  const margenScore = ratio(positive(row.margen), ctx.maxMargen) * 35
  const docsScore = ratio(positive(row.docs), ctx.maxDocs) * 18
  const ventasScore = ratio(positive(row.ventas), ctx.maxVentas) * 12
  const margenPctScore = ratio(Math.max(row.margen_pct ?? 0, 0), 35) * 15
  const recenciaScore = recencyScore(row.ultima_compra) * 12
  const deudaPenalty = ratio(ctx.pendiente, Math.max(positive(row.ventas), 1)) * 22

  return clamp(Math.round(margenScore + docsScore + ventasScore + margenPctScore + recenciaScore - deudaPenalty), 0, 100)
}

function recencyScore(date: string | null): number {
  const days = daysSince(date)
  if (days == null) return 0
  if (days <= 7) return 1
  if (days <= 14) return 0.85
  if (days <= 21) return 0.65
  if (days <= 35) return 0.4
  if (days <= 60) return 0.2
  return 0
}

function daysSince(date: string | null): number | null {
  if (!date) return null
  const ts = new Date(`${date}T00:00:00`).getTime()
  if (Number.isNaN(ts)) return null
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000))
}

function getPendiente(row: SegmentInput): number {
  return positive(row.pendiente_cobro ?? row.pendiente ?? 0)
}

function ratio(value: number, max: number): number {
  if (max <= 0) return 0
  return clamp(value / max, 0, 1)
}

function positive(value: number): number {
  return Math.max(Number(value) || 0, 0)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
