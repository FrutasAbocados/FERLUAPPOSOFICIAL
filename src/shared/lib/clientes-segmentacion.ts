export type ClienteABCClase = 'A' | 'B' | 'C'

export type ClientePrograma =
  | 'vip'
  | 'a'
  | 'b'
  | 'c'
  | 'atencion'

export type ScoreFactor = {
  nombre: string
  descripcion: string
  puntos: number
  max: number
}

export type ScoreBreakdown = {
  factores: ScoreFactor[]
  total: number
  claseRazon: string
  programaRazon: string
}

export type ClienteSegmentacion = {
  clase: ClienteABCClase
  programa: ClientePrograma
  programaLabel: string
  accionSugerida: string
  loyaltyScore: number
  scoreBreakdown: ScoreBreakdown
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
  vip:      { programaLabel: 'VIP',      accionSugerida: 'Mantener trato preferente y exclusividad' },
  a:        { programaLabel: 'Clase A',  accionSugerida: 'Fidelizar y aumentar pedido medio' },
  b:        { programaLabel: 'Clase B',  accionSugerida: 'Subir ticket y frecuencia — llevar a Clase A' },
  c:        { programaLabel: 'Clase C',  accionSugerida: 'Revisar precios — subir margen o dejar ir' },
  atencion: { programaLabel: 'Atención', accionSugerida: 'Contactar — lleva tiempo sin pedir' },
}

// ── Scoring ───────────────────────────────────────────────────────────────────
// Pesos: margen absoluto 35 · margen% 20 · frecuencia 15 · ticket medio 20 · recencia 10
// Ticket medio pesa más que frecuencia: muchos pedidos pequeños no deben inflar el score.
// SIN penalización por pendiente (no distingue vencido vs. a plazo normal)

type ScoreCtx = {
  maxMargen: number
  maxDocs: number
  maxTicketMedio: number
}

function scoreClienteDetallado(row: SegmentInput, ctx: ScoreCtx): { total: number; factores: ScoreFactor[] } {
  const margenAbs  = positive(row.margen)
  const margenPct  = Math.max(row.margen_pct ?? 0, 0)
  const docs       = positive(row.docs)
  const ticketMed  = docs > 0 ? positive(row.ventas) / docs : 0

  const f1 = { nombre: 'Margen absoluto', descripcion: 'Margen bruto generado en el periodo',       puntos: Math.round(ratio(margenAbs, ctx.maxMargen) * 35),      max: 35 }
  const f2 = { nombre: 'Margen %',        descripcion: '% de margen sobre ventas (ref. máx. 35%)',  puntos: Math.round(ratio(margenPct, 35) * 20),                 max: 20 }
  const f3 = { nombre: 'Frecuencia',      descripcion: 'Número de pedidos (capped: muchos pedidos pequeños no puntúan igual que pocos grandes)', puntos: Math.round(ratio(docs, ctx.maxDocs) * 15), max: 15 }
  const f4 = { nombre: 'Ticket medio',    descripcion: 'Valor medio por pedido — premia clientes de mayor valor unitario', puntos: Math.round(ratio(ticketMed, ctx.maxTicketMedio) * 20), max: 20 }
  const f5 = { nombre: 'Recencia',        descripcion: 'Tiempo desde el último pedido',             puntos: Math.round(recencyScore(row.ultima_compra) * 10),      max: 10 }

  const total = clamp(f1.puntos + f2.puntos + f3.puntos + f4.puntos + f5.puntos, 0, 100)
  return { total, factores: [f1, f2, f3, f4, f5] }
}

// ── Clasificación ─────────────────────────────────────────────────────────────
// Sistema 5 categorías: vip / a / b / c / atencion
// "Atención" sobreescribe cualquier otra categoría cuando el cliente lleva demasiado tiempo sin pedir.
// VIP = Clase A + score >= 70 (top top: alto margen Y alta calidad). A = Clase A resto. B = Clase B. C = Clase C.
// No hay "deuda" automática — el pendiente no distingue vencido de plazo normal.

function programaCliente(
  row: SegmentInput,
  clase: ClienteABCClase,
  score: number,
): { programa: ClientePrograma; razon: string } {
  const diasSinPedir  = row.dias_sin_pedir ?? daysSince(row.ultima_compra)
  const cadencia      = row.cadencia_dias ?? null
  const rompeCadencia = cadencia != null && diasSinPedir != null && diasSinPedir >= Math.max(cadencia + 3, cadencia * 1.6)

  // Umbral de silencio según clase: A=21d, B=35d, C=60d
  const silencioUmbral = clase === 'A' ? 21 : clase === 'B' ? 35 : 60
  const demasiadoSilencio = diasSinPedir != null && diasSinPedir >= silencioUmbral

  if (rompeCadencia || demasiadoSilencio) {
    const motivo = rompeCadencia
      ? `lleva ${diasSinPedir}d sin pedir (cadencia habitual: ${cadencia}d)`
      : `lleva ${diasSinPedir}d sin pedir`
    return { programa: 'atencion', razon: `${motivo} → contactar` }
  }

  if (clase === 'A' && score >= 70) {
    return { programa: 'vip', razon: `Clase A con score ${score}/100 — alto margen y alta calidad de pedido` }
  }
  if (clase === 'A') {
    return { programa: 'a', razon: `Clase A con score ${score}/100 — cliente sólido en top 70% margen` }
  }
  if (clase === 'B') {
    return { programa: 'b', razon: `Clase B — potencial para subir a Clase A con más ticket o frecuencia` }
  }
  return { programa: 'c', razon: 'Clase C — evaluar si subir precios o dejar ir' }
}

function claseRazon(clase: ClienteABCClase, propioMargen: number, total: number): string {
  const pct = total > 0 ? Math.round((propioMargen / total) * 100) : 0
  const pctStr = pct > 0 ? `${pct}% del margen total` : 'margen negativo o nulo'
  if (clase === 'A') return `Aporta el ${pctStr} — está en el top 70% → Clase A`
  if (clase === 'B') return `Aporta el ${pctStr} — está entre el 70–90% → Clase B`
  return `Aporta el ${pctStr} — fuera del top 90% → Clase C`
}

// ── segmentarClientes ─────────────────────────────────────────────────────────

export function segmentarClientes<T extends SegmentInput>(rows: T[]): Array<T & ClienteSegmentacion> {
  const totalMargen    = rows.reduce((sum, r) => sum + positive(r.margen), 0)
  const maxMargen      = Math.max(...rows.map(r => positive(r.margen)), 0)
  const maxDocs        = Math.max(...rows.map(r => positive(r.docs)), 0)
  const maxTicketMedio = Math.max(...rows.map(r => r.docs > 0 ? positive(r.ventas) / r.docs : 0), 0)

  // Pareto ABC por margen
  const sorted = [...rows].sort((a, b) => b.margen - a.margen)
  const clases = new Map<string, { clase: ClienteABCClase; propioMargen: number }>()
  let acc = 0
  for (const row of sorted) {
    const pos: ClienteABCClase = totalMargen > 0
      ? acc / totalMargen < 0.7 ? 'A' : acc / totalMargen < 0.9 ? 'B' : 'C'
      : 'C'
    clases.set(row.contact_name_canon, { clase: positive(row.margen) > 0 ? pos : 'C', propioMargen: positive(row.margen) })
    acc += positive(row.margen)
  }

  const ctx: ScoreCtx = { maxMargen, maxDocs, maxTicketMedio }

  return rows.map((row) => {
    const { clase, propioMargen } = clases.get(row.contact_name_canon) ?? { clase: 'C' as ClienteABCClase, propioMargen: 0 }
    const { total: score, factores } = scoreClienteDetallado(row, ctx)
    const { programa, razon: programaRazon } = programaCliente(row, clase, score)

    const breakdown: ScoreBreakdown = {
      factores,
      total: score,
      claseRazon: claseRazon(clase, propioMargen, totalMargen),
      programaRazon,
    }

    return {
      ...row,
      clase,
      programa,
      loyaltyScore: score,
      scoreBreakdown: breakdown,
      ...PROGRAMA_META[programa],
    }
  })
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function recencyScore(date: string | null): number {
  const days = daysSince(date)
  if (days == null) return 0
  if (days <= 7)  return 1
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
