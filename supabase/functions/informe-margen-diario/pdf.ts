// PDF del informe diario de margen.
// Página 1 = resumen para decidir (cifras clave, termómetro de margen, alertas
// y gráficos). Después, el anexo con las tablas completas.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'

export const MARGEN_BAJO_PCT = 20

export type Linea = {
  producto: string
  unidades: number
  precio: number | null
  coste_unidad: number | null
  ventas: number
  margen: number
  base_coste: number
  pendiente: boolean
}

export type Producto = {
  producto: string
  documentos: number
  unidades: number
  ventas: number
  margen: number
  base_coste: number
  lineas_pendientes: number
}

export type Factura = {
  doc_number: string
  subtipo: string
  cliente: string
  ventas: number
  margen: number
  base_coste: number
  lineas: number
  lineas_pendientes: number
  detalle: Linea[]
}

export type ClienteMes = {
  cliente: string
  documentos: number
  ventas: number
  margen: number
  base_coste: number
  ventas_dia: number
  lineas_pendientes: number
}

type Totales = { documentos: number; ventas: number; margen: number; base_coste: number; lineas_pendientes?: number }

export type Informe = {
  fecha: string
  mes_desde: string
  dia: Totales
  mes_total: Totales
  facturas: Factura[]
  productos_dia: Producto[]
  clientes_mes: ClienteMes[]
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const eurFmt = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
export const eur = (n: number) => `${eurFmt.format(Number(n ?? 0))} €`
const eur0Fmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })
const eur0 = (n: number) => `${eur0Fmt.format(Number(n ?? 0))} €`
const numFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' })
const num = (n: number | null) => n === null || n === undefined ? '—' : numFmt.format(Number(n))
const eur3 = (n: number | null) => n === null || n === undefined ? '—' : `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(Number(n))} €`
export const pct = (margen: number, base: number) => Number(base) > 0 ? (100 * Number(margen)) / Number(base) : null
export const pctTxt = (p: number | null) => p === null ? '—' : `${p.toFixed(1).replace('.', ',')}%`
const fechaLarga = (iso: string) => new Intl.DateTimeFormat('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${iso}T00:00:00Z`))
const fechaCorta = (iso: string) => new Intl.DateTimeFormat('es-ES', {
  day: 'numeric', month: 'short', timeZone: 'UTC',
}).format(new Date(`${iso}T00:00:00Z`))
const SUBTIPO: Record<string, string> = { invoice: 'Factura', salesreceipt: 'Ticket', waybill: 'Albarán' }
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Helvetica estándar = WinAnsi: se quitan caracteres que no puede codificar.
function safe(s: string): string {
  return String(s ?? '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u20AC\u2026\u2022]/g, '')
}

// ---------------------------------------------------------------------------
// Colores y semáforo
// ---------------------------------------------------------------------------

type Color = ReturnType<typeof rgb>

const C = {
  ink: rgb(0.11, 0.13, 0.12),
  muted: rgb(0.45, 0.48, 0.46),
  zebra: rgb(0.965, 0.972, 0.967),
  card: rgb(0.955, 0.965, 0.958),
  brand: rgb(0.07, 0.30, 0.19),
  brandSoft: rgb(0.85, 0.92, 0.87),
  green: rgb(0.10, 0.52, 0.30),
  greenBg: rgb(0.87, 0.95, 0.90),
  red: rgb(0.80, 0.16, 0.16),
  redBg: rgb(0.99, 0.90, 0.89),
  amber: rgb(0.82, 0.52, 0.02),
  amberBg: rgb(1.0, 0.95, 0.84),
  white: rgb(1, 1, 1),
}

type Tono = 'bien' | 'bajo' | 'sin'

function tono(p: number | null): Tono {
  if (p === null) return 'sin'
  return p < MARGEN_BAJO_PCT ? 'bajo' : 'bien'
}
const TONO: Record<Tono, { fg: Color; bg: Color }> = {
  bien: { fg: C.green, bg: C.greenBg },
  bajo: { fg: C.red, bg: C.redBg },
  sin: { fg: C.amber, bg: C.amberBg },
}

// ---------------------------------------------------------------------------
// Primitivas
// ---------------------------------------------------------------------------

type Col = { title: string; width: number; align?: 'left' | 'right' }
type Cell = { text: string; color?: Color; bold?: boolean; pill?: Tono; bar?: number }
type Group = { group: string; right?: string; pill?: { text: string; tono: Tono } }
type Row = Cell[] | Group

class Doc {
  pdf!: PDFDocument
  font!: PDFFont
  bold!: PDFFont
  page!: PDFPage
  y = 0
  readonly W = 595.28
  readonly H = 841.89
  readonly M = 30

  static async create(): Promise<Doc> {
    const d = new Doc()
    d.pdf = await PDFDocument.create()
    d.font = await d.pdf.embedFont(StandardFonts.Helvetica)
    d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold)
    d.newPage()
    return d
  }

  get inner() { return this.W - 2 * this.M }

  newPage() {
    this.page = this.pdf.addPage([this.W, this.H])
    this.y = this.H - this.M
  }

  ensure(h: number, onBreak?: () => void) {
    if (this.y - h < this.M + 18) {
      this.newPage()
      onBreak?.()
    }
  }

  width(s: string, size: number, bold = false) {
    return (bold ? this.bold : this.font).widthOfTextAtSize(safe(s), size)
  }

  text(s: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: Color } = {}) {
    this.page.drawText(safe(s), { x, y, size, font: opts.bold ? this.bold : this.font, color: opts.color ?? C.ink })
  }

  textRight(s: string, xRight: number, y: number, size: number, opts: { bold?: boolean; color?: Color } = {}) {
    this.text(s, xRight - this.width(s, size, opts.bold), y, size, opts)
  }

  fit(s: string, width: number, size: number, bold = false): string {
    const f = bold ? this.bold : this.font
    let t = safe(s)
    if (f.widthOfTextAtSize(t, size) <= width) return t
    while (t.length > 1 && f.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1)
    return `${t}…`
  }

  rect(x: number, y: number, w: number, h: number, color: Color) {
    this.page.drawRectangle({ x, y, width: Math.max(w, 0), height: h, color })
  }

  // Etiqueta de color con el margen %: el ojo va directo al semáforo.
  pill(text: string, t: Tono, xRight: number, yBase: number, size = 7.5) {
    const w = this.width(text, size, true) + 8
    const h = size + 4.5
    this.page.drawRectangle({ x: xRight - w, y: yBase - 3, width: w, height: h, color: TONO[t].bg })
    this.text(text, xRight - w + 4, yBase, size, { bold: true, color: TONO[t].fg })
  }

  // Título de sección: barra de color + texto corto.
  section(title: string, right?: string) {
    this.ensure(40)
    this.y -= 8
    this.rect(this.M, this.y - 13, 3.5, 14, C.brand)
    this.text(title, this.M + 9, this.y - 10.5, 11.5, { bold: true, color: C.brand })
    if (right) this.textRight(right, this.W - this.M, this.y - 10, 7.5, { color: C.muted })
    this.y -= 22
  }

  // ---- Bloques de la página 1 ---------------------------------------------

  header(fecha: string) {
    const h = 58
    this.rect(0, this.H - h, this.W, h, C.brand)
    this.text('MARGEN DEL DÍA', this.M, this.H - 22, 8, { bold: true, color: C.brandSoft })
    this.text(capital(fechaLarga(fecha)), this.M, this.H - 44, 19, { bold: true, color: C.white })
    this.textRight('Frutas Abocados', this.W - this.M, this.H - 22, 8, { bold: true, color: C.brandSoft })
    this.textRight('importes sin IVA', this.W - this.M, this.H - 44, 8, { color: C.brandSoft })
    this.y = this.H - h - 14
  }

  hero(items: Array<{ label: string; value: string; sub: string; color?: Color; bg?: Color }>) {
    const gap = 8
    const w = (this.inner - gap * (items.length - 1)) / items.length
    const h = 62
    items.forEach((it, i) => {
      const x = this.M + i * (w + gap)
      this.rect(x, this.y - h, w, h, it.bg ?? C.card)
      this.text(it.label.toUpperCase(), x + 10, this.y - 15, 7, { bold: true, color: C.muted })
      this.text(it.value, x + 10, this.y - 39, 21, { bold: true, color: it.color ?? C.ink })
      this.text(it.sub, x + 10, this.y - 53, 7.5, { color: C.muted })
    })
    this.y -= h + 12
  }

  // Termómetro: dónde cae el margen de hoy y el del mes frente al mínimo.
  gauge(pDia: number | null, pMes: number | null) {
    const max = Math.max(50, Math.ceil(Math.max(pDia ?? 0, pMes ?? 0) / 10) * 10)
    const x0 = this.M + 70
    const w = this.inner - 70
    const barY = this.y - 24
    const h = 10
    const xOf = (p: number) => x0 + (Math.min(Math.max(p, 0), max) / max) * w
    this.text('MARGEN %', this.M, barY + 2, 7, { bold: true, color: C.muted })
    this.rect(x0, barY, xOf(MARGEN_BAJO_PCT) - x0, h, C.redBg)
    this.rect(xOf(MARGEN_BAJO_PCT), barY, x0 + w - xOf(MARGEN_BAJO_PCT), h, C.greenBg)
    for (let p = 0; p <= max; p += 10) {
      this.text(`${p}%`, xOf(p) - this.width(`${p}%`, 6) / 2, barY - 9, 6, { color: C.muted })
    }
    if (pMes !== null) {
      const x = xOf(pMes)
      this.page.drawLine({ start: { x, y: barY - 2 }, end: { x, y: barY + h + 2 }, thickness: 1.5, color: C.muted })
      const t = `mes ${pctTxt(pMes)}`
      this.text(t, x - this.width(t, 6.5) / 2, barY - 18, 6.5, { bold: true, color: C.muted })
    }
    if (pDia !== null) {
      const x = xOf(pDia)
      const col = TONO[tono(pDia)].fg
      this.rect(x - 2, barY - 3, 4, h + 6, col)
      const t = `hoy ${pctTxt(pDia)}`
      this.text(t, x - this.width(t, 7.5, true) / 2, barY + h + 5, 7.5, { bold: true, color: col })
    }
    this.y = barY - 28
  }

  alerts(items: Alerta[]) {
    for (const a of items) {
      const detalle = a.detalle.slice(0, 3)
      const h = 17 + detalle.length * 10.5
      this.ensure(h + 4)
      const { fg, bg } = a.tono === 'ok' ? TONO.bien : a.tono === 'rojo' ? TONO.bajo : TONO.sin
      this.rect(this.M, this.y - h, this.inner, h, bg)
      this.rect(this.M, this.y - h, 3.5, h, fg)
      this.text(a.titulo, this.M + 11, this.y - 12, 9, { bold: true, color: fg })
      detalle.forEach((d, i) => {
        const yy = this.y - 24 - i * 10.5
        this.text(this.fit(d.izq, this.inner - 150, 7.8), this.M + 11, yy, 7.8, { color: C.ink })
        this.textRight(d.der, this.W - this.M - 8, yy, 7.8, { bold: true, color: fg })
      })
      this.y -= h + 4
    }
    this.y -= 4
  }

  // Barras horizontales: largo = ventas, color = semáforo del margen.
  bars(rows: Array<{ label: string; value: number; valueTxt: string; p: number | null; extra?: string }>) {
    if (!rows.length) return
    const labelW = 168
    const pillW = 44
    const valueW = 58
    const x0 = this.M + labelW
    const w = this.inner - labelW - pillW - valueW - 6
    const max = Math.max(...rows.map((r) => r.value), 1)
    const rowH = 14
    for (const r of rows) {
      this.ensure(rowH)
      const t = tono(r.p)
      const yy = this.y - 10
      this.text(this.fit(r.label, labelW - 8, 7.8), this.M, yy, 7.8)
      this.rect(x0, this.y - 11, w, 9, C.zebra)
      this.rect(x0, this.y - 11, (Math.max(r.value, 0) / max) * w, 9, t === 'bajo' ? C.red : t === 'sin' ? C.amber : C.green)
      this.textRight(r.valueTxt, x0 + w + valueW, yy, 7.8, { bold: true })
      this.pill(pctTxt(r.p), t, this.W - this.M, yy, 7)
      this.y -= rowH
    }
    this.y -= 6
  }

  // ---- Tablas del anexo ---------------------------------------------------

  table(cols: Col[], rows: Row[], total?: Cell[]) {
    const rowH = 13.5
    const size = 7.5
    const header = () => {
      let x = this.M
      for (const c of cols) {
        const t = this.fit(c.title.toUpperCase(), c.width - 6, 6.3, true)
        const tx = c.align === 'right' ? x + c.width - 3 - this.bold.widthOfTextAtSize(t, 6.3) : x + 3
        this.text(t, tx, this.y - 9, 6.3, { bold: true, color: C.muted })
        x += c.width
      }
      this.page.drawLine({ start: { x: this.M, y: this.y - rowH + 1 }, end: { x: this.W - this.M, y: this.y - rowH + 1 }, thickness: 0.8, color: C.brand })
      this.y -= rowH
    }
    this.ensure(rowH * 3)
    header()
    const drawRow = (cells: Cell[], i: number, isTotal = false) => {
      this.ensure(rowH, header)
      if (isTotal) {
        this.page.drawLine({ start: { x: this.M, y: this.y }, end: { x: this.W - this.M, y: this.y }, thickness: 0.8, color: C.ink })
      } else if (i % 2 === 1) {
        this.rect(this.M, this.y - rowH, this.inner, rowH, C.zebra)
      }
      let x = this.M
      cells.forEach((cell, ci) => {
        const col = cols[ci]
        const yy = this.y - 9.5
        if (cell.bar !== undefined && cell.bar > 0) {
          this.rect(x + 2, this.y - rowH + 2.5, (col.width - 4) * Math.min(cell.bar, 1), rowH - 5, C.brandSoft)
        }
        if (cell.pill && cell.text !== '—') {
          this.pill(cell.text, cell.pill, x + col.width - 3, yy, 7)
        } else {
          const bold = isTotal || cell.bold
          const t = this.fit(cell.text, col.width - 6, size, bold)
          const tx = col.align === 'right' ? x + col.width - 3 - this.width(t, size, bold) : x + 3
          this.text(t, tx, yy, size, { bold, color: cell.color ?? (cell.text === '—' ? C.muted : C.ink) })
        }
        x += col.width
      })
      this.y -= rowH
    }
    const drawGroup = (g: Group) => {
      this.ensure(rowH * 2.5, header)
      this.y -= 3
      this.rect(this.M, this.y - rowH, this.inner, rowH, C.brandSoft)
      let rightEdge = this.W - this.M - 3
      if (g.pill) {
        this.pill(g.pill.text, g.pill.tono, rightEdge, this.y - 9.5, 7)
        rightEdge -= this.width(g.pill.text, 7, true) + 14
      }
      const right = g.right ? safe(g.right) : ''
      const rw = right ? this.width(right, size, true) : 0
      if (right) this.text(right, rightEdge - rw, this.y - 9.5, size, { bold: true })
      this.text(this.fit(g.group, rightEdge - rw - this.M - 16, size, true), this.M + 4, this.y - 9.5, size, { bold: true, color: C.brand })
      this.y -= rowH
    }
    let zebra = 0
    rows.forEach((r) => {
      if (Array.isArray(r)) drawRow(r, zebra++)
      else { drawGroup(r); zebra = 0 }
    })
    if (total) drawRow(total, 0, true)
    this.y -= 12
  }

  footer(label: string) {
    const pages = this.pdf.getPages()
    pages.forEach((p, i) => {
      const t = safe(`${label}  •  ${i + 1}/${pages.length}`)
      p.drawText(t, { x: this.M, y: 16, size: 6.5, font: this.font, color: C.muted })
    })
  }
}

// ---------------------------------------------------------------------------
// Alertas: lo que merece una decisión hoy
// ---------------------------------------------------------------------------

type Alerta = { tono: 'rojo' | 'ambar' | 'ok'; titulo: string; detalle: Array<{ izq: string; der: string }> }

export function alertas(inf: Informe): Alerta[] {
  const out: Alerta[] = []
  const bajo = (m: number, b: number) => {
    const p = pct(m, b)
    return p !== null && p < MARGEN_BAJO_PCT
  }

  const negativos = inf.productos_dia.filter((p) => p.margen < 0).sort((a, b) => a.margen - b.margen)
  if (negativos.length) {
    out.push({
      tono: 'rojo',
      titulo: `${negativos.length} ${negativos.length === 1 ? 'producto vendido' : 'productos vendidos'} por debajo del coste`,
      detalle: negativos.map((p) => ({ izq: `${p.producto} · ${num(p.unidades)} uds · ${eur(p.ventas)}`, der: `${eur(p.margen)}` })),
    })
  }

  const docs = inf.facturas.filter((f) => bajo(f.margen, f.base_coste))
    .sort((a, b) => (pct(a.margen, a.base_coste) ?? 0) - (pct(b.margen, b.base_coste) ?? 0))
  if (docs.length) {
    out.push({
      tono: 'rojo',
      titulo: `${docs.length} ${docs.length === 1 ? 'documento' : 'documentos'} por debajo del ${MARGEN_BAJO_PCT}%`,
      detalle: docs.map((f) => ({ izq: `${f.doc_number} · ${f.cliente} · ${eur(f.ventas)}`, der: pctTxt(pct(f.margen, f.base_coste)) })),
    })
  }

  // Productos con peso en el día y margen flojo (los negativos ya salen arriba).
  const minVenta = Math.max(30, inf.dia.ventas * 0.01)
  const prods = inf.productos_dia
    .filter((p) => p.margen >= 0 && p.ventas >= minVenta && bajo(p.margen, p.base_coste))
    .sort((a, b) => b.ventas - a.ventas)
  if (prods.length) {
    out.push({
      tono: 'rojo',
      titulo: `${prods.length} ${prods.length === 1 ? 'producto' : 'productos'} con margen bajo · ¿subir precio o revisar compra?`,
      detalle: prods.map((p) => ({ izq: `${p.producto} · ${eur(p.ventas)} vendidos`, der: pctTxt(pct(p.margen, p.base_coste)) })),
    })
  }

  const sinCoste = inf.productos_dia.filter((p) => p.lineas_pendientes > 0).sort((a, b) => b.ventas - a.ventas)
  if (sinCoste.length) {
    const n = inf.dia.lineas_pendientes ?? 0
    out.push({
      tono: 'ambar',
      titulo: `${n} ${n === 1 ? 'línea' : 'líneas'} sin coste de compra · su margen no cuenta`,
      detalle: sinCoste.map((p) => ({ izq: p.producto, der: eur(p.ventas) })),
    })
  }

  if (!out.length) {
    out.push({ tono: 'ok', titulo: `Todo en orden: ningún documento ni producto por debajo del ${MARGEN_BAJO_PCT}%`, detalle: [] })
  }
  return out
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

export async function buildPdf(inf: Informe): Promise<Uint8Array> {
  const d = await Doc.create()
  const pDia = pct(inf.dia.margen, inf.dia.base_coste)
  const pMes = pct(inf.mes_total.margen, inf.mes_total.base_coste)
  const diasMes = Number(inf.fecha.slice(8, 10))
  const mediaDiaria = inf.mes_total.ventas / Math.max(diasMes, 1)
  const vsMedia = mediaDiaria > 0 ? (100 * (inf.dia.ventas - mediaDiaria)) / mediaDiaria : null
  const difPts = pDia !== null && pMes !== null ? pDia - pMes : null

  // ---- Página 1: resumen -------------------------------------------------
  d.header(inf.fecha)
  d.hero([
    {
      label: 'Ventas',
      value: eur0(inf.dia.ventas),
      sub: vsMedia === null ? `${inf.dia.documentos} documentos`
        : `${inf.dia.documentos} docs · ${vsMedia >= 0 ? '+' : ''}${vsMedia.toFixed(0)}% vs media del mes`,
    },
    { label: 'Margen', value: eur0(inf.dia.margen), sub: `mes: ${eur0(inf.mes_total.margen)}` },
    {
      label: 'Margen %',
      value: pctTxt(pDia),
      color: TONO[tono(pDia)].fg,
      bg: TONO[tono(pDia)].bg,
      sub: difPts === null ? `mínimo ${MARGEN_BAJO_PCT}%`
        : `${difPts >= 0 ? '+' : ''}${difPts.toFixed(1).replace('.', ',')} pts vs mes (${pctTxt(pMes)})`,
    },
  ])
  d.gauge(pDia, pMes)

  d.section('Qué mirar hoy')
  d.alerts(alertas(inf))

  d.section('Productos que más venden', `top 10 de ${inf.productos_dia.length} · barra = ventas`)
  d.bars(inf.productos_dia.slice(0, 10).map((p) => ({
    label: p.producto, value: p.ventas, valueTxt: eur(p.ventas), p: pct(p.margen, p.base_coste),
  })))

  const porCliente = new Map<string, { ventas: number; margen: number; base_coste: number }>()
  for (const f of inf.facturas) {
    const c = porCliente.get(f.cliente) ?? { ventas: 0, margen: 0, base_coste: 0 }
    c.ventas += f.ventas; c.margen += f.margen; c.base_coste += f.base_coste
    porCliente.set(f.cliente, c)
  }
  const clientesDia = [...porCliente].sort((a, b) => b[1].ventas - a[1].ventas)
  d.section('Clientes de hoy', `top 10 de ${clientesDia.length}`)
  d.bars(clientesDia.slice(0, 10).map(([cliente, c]) => ({
    label: cliente, value: c.ventas, valueTxt: eur(c.ventas), p: pct(c.margen, c.base_coste),
  })))

  // ---- Página 2: el mes --------------------------------------------------
  d.newPage()
  d.section(`Mes hasta hoy · ${fechaCorta(inf.mes_desde)} - ${fechaCorta(inf.fecha)}`)
  d.hero([
    { label: 'Ventas mes', value: eur0(inf.mes_total.ventas), sub: `${inf.mes_total.documentos} docs · ${eur0(mediaDiaria)}/día` },
    { label: 'Margen mes', value: eur0(inf.mes_total.margen), sub: `${inf.clientes_mes.length} clientes` },
    { label: 'Margen % mes', value: pctTxt(pMes), color: TONO[tono(pMes)].fg, bg: TONO[tono(pMes)].bg, sub: `mínimo ${MARGEN_BAJO_PCT}%` },
  ])
  d.section('Mejores clientes del mes', `top 15 de ${inf.clientes_mes.length}`)
  d.bars(inf.clientes_mes.slice(0, 15).map((c) => ({
    label: c.cliente, value: c.ventas, valueTxt: eur0(c.ventas), p: pct(c.margen, c.base_coste),
  })))
  const clientesBajos = inf.clientes_mes
    .filter((c) => { const p = pct(c.margen, c.base_coste); return p !== null && p < MARGEN_BAJO_PCT })
  if (clientesBajos.length) {
    d.section(`Clientes del mes por debajo del ${MARGEN_BAJO_PCT}%`, `${clientesBajos.length} clientes`)
    d.bars(clientesBajos.slice(0, 12).map((c) => ({
      label: c.cliente, value: c.ventas, valueTxt: eur0(c.ventas), p: pct(c.margen, c.base_coste),
    })))
  }

  // ---- Anexo: tablas completas ------------------------------------------
  d.section('Anexo · Documentos del día', 'peor margen primero')
  const facturas = [...inf.facturas].sort((a, b) =>
    (pct(a.margen, a.base_coste) ?? 999) - (pct(b.margen, b.base_coste) ?? 999))
  const maxDoc = Math.max(...facturas.map((f) => f.ventas), 1)
  d.table(
    [
      { title: 'Documento', width: 56 },
      { title: 'Tipo', width: 40 },
      { title: 'Cliente', width: 205 },
      { title: 'Ventas', width: 80, align: 'right' },
      { title: 'Margen', width: 60, align: 'right' },
      { title: 'Margen %', width: 50, align: 'right' },
      { title: 'Sin coste', width: 44, align: 'right' },
    ],
    facturas.map((f) => {
      const p = pct(f.margen, f.base_coste)
      return [
        { text: f.doc_number },
        { text: SUBTIPO[f.subtipo] ?? f.subtipo, color: C.muted },
        { text: f.cliente },
        { text: eur(f.ventas), bar: f.ventas / maxDoc },
        { text: eur(f.margen), color: f.margen < 0 ? C.red : undefined },
        { text: pctTxt(p), pill: tono(p) },
        { text: f.lineas_pendientes ? `${f.lineas_pendientes}/${f.lineas}` : '—', color: f.lineas_pendientes ? C.amber : undefined },
      ]
    }),
    [
      { text: 'TOTAL' }, { text: '' }, { text: `${inf.dia.documentos} documentos` },
      { text: eur(inf.dia.ventas) }, { text: eur(inf.dia.margen) },
      { text: pctTxt(pDia), color: TONO[tono(pDia)].fg },
      { text: inf.dia.lineas_pendientes ? String(inf.dia.lineas_pendientes) : '—' },
    ],
  )

  d.section('Anexo · Productos del día', `${inf.productos_dia.length} productos por ventas`)
  const maxProd = Math.max(...inf.productos_dia.map((p) => p.ventas), 1)
  d.table(
    [
      { title: 'Producto', width: 200 },
      { title: 'Docs', width: 30, align: 'right' },
      { title: 'Uds', width: 46, align: 'right' },
      { title: 'Precio medio', width: 58, align: 'right' },
      { title: 'Ventas', width: 80, align: 'right' },
      { title: 'Margen', width: 60, align: 'right' },
      { title: 'Margen %', width: 61, align: 'right' },
    ],
    inf.productos_dia.map((p) => {
      const pc = p.lineas_pendientes && !p.base_coste ? null : pct(p.margen, p.base_coste)
      return [
        { text: p.producto },
        { text: String(p.documentos) },
        { text: num(p.unidades) },
        { text: p.unidades ? eur3(p.ventas / p.unidades) : '—' },
        { text: eur(p.ventas), bar: p.ventas / maxProd },
        { text: eur(p.margen), color: p.margen < 0 ? C.red : undefined },
        { text: pc === null ? 'sin coste' : pctTxt(pc), pill: tono(pc) },
      ]
    }),
  )

  d.section('Anexo · Detalle de cada documento')
  const detalleRows: Row[] = []
  for (const f of facturas) {
    const pf = pct(f.margen, f.base_coste)
    detalleRows.push({
      group: `${f.doc_number} · ${f.cliente}`,
      right: `${eur(f.ventas)}  ·  ${eur(f.margen)}`,
      pill: { text: pctTxt(pf), tono: tono(pf) },
    })
    for (const l of f.detalle ?? []) {
      const pl = l.pendiente ? null : pct(l.margen, l.base_coste)
      detalleRows.push([
        { text: l.producto },
        { text: num(l.unidades) },
        { text: eur3(l.precio) },
        { text: l.coste_unidad === null ? 'sin coste' : eur3(l.coste_unidad), color: l.coste_unidad === null ? C.amber : undefined },
        { text: eur(l.ventas) },
        { text: eur(l.margen), color: l.margen < 0 ? C.red : undefined },
        { text: l.pendiente ? 'sin coste' : pctTxt(pl), pill: tono(pl) },
      ])
    }
  }
  d.table(
    [
      { title: 'Producto', width: 210 },
      { title: 'Uds', width: 46, align: 'right' },
      { title: 'Precio', width: 56, align: 'right' },
      { title: 'Coste/u', width: 56, align: 'right' },
      { title: 'Venta', width: 58, align: 'right' },
      { title: 'Margen', width: 54, align: 'right' },
      { title: 'Margen %', width: 55.28, align: 'right' },
    ],
    detalleRows,
  )

  d.section('Anexo · Clientes del mes', `${inf.clientes_mes.length} clientes por ventas`)
  const maxCli = Math.max(...inf.clientes_mes.map((c) => c.ventas), 1)
  d.table(
    [
      { title: 'Cliente', width: 215 },
      { title: 'Docs', width: 34, align: 'right' },
      { title: 'Hoy', width: 58, align: 'right' },
      { title: 'Ventas mes', width: 80, align: 'right' },
      { title: 'Margen mes', width: 62, align: 'right' },
      { title: 'Margen %', width: 86.28, align: 'right' },
    ],
    inf.clientes_mes.map((c) => {
      const p = pct(c.margen, c.base_coste)
      return [
        { text: c.cliente },
        { text: String(c.documentos) },
        { text: c.ventas_dia ? eur(c.ventas_dia) : '—' },
        { text: eur(c.ventas), bar: c.ventas / maxCli },
        { text: eur(c.margen), color: c.margen < 0 ? C.red : undefined },
        { text: pctTxt(p), pill: tono(p) },
      ]
    }),
    [
      { text: 'TOTAL MES' }, { text: String(inf.mes_total.documentos) }, { text: eur(inf.dia.ventas) },
      { text: eur(inf.mes_total.ventas) }, { text: eur(inf.mes_total.margen) },
      { text: pctTxt(pMes), color: TONO[tono(pMes)].fg },
    ],
  )

  const generado = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date())
  d.footer(`Abocados OS • generado ${generado} • sin IVA • margen % sobre ventas con coste • rojo < ${MARGEN_BAJO_PCT}% • ámbar = sin coste de compra`)
  return await d.pdf.save()
}
