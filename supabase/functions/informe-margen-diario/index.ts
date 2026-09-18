// Edge Function: informe-margen-diario
// ----------------------------------------------------------------------------
// Genera el PDF diario de margen (factura a factura del día + acumulado del mes
// por cliente), lo sube al bucket privado `informes-margen` y envía por
// WhatsApp (CallMeBot) un resumen con enlace firmado al PDF.
//
// Disparable por:
//   - Cron pg_cron 22:00 Europe/Madrid (Authorization: Bearer service_role).
//   - Manual desde admin (Authorization: Bearer JWT con role admin_full/admin_op).
//
// Body opcional: { fecha?: 'YYYY-MM-DD', trigger?: string, send?: boolean, force?: boolean }
// El cron no reenvía si ya hay un envío OK para la fecha (salvo force).
// El WhatsApp lleva un enlace corto a `informe-margen-pdf?t=<token>`, que firma
// el PDF al vuelo; el token caduca a los 7 días.
// ----------------------------------------------------------------------------

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'informes-margen'
const LINK_TTL_SECONDS = 7 * 24 * 3600
const MARGEN_BAJO_PCT = 20

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Linea = {
  producto: string
  unidades: number
  precio: number | null
  coste_unidad: number | null
  ventas: number
  margen: number
  base_coste: number
  pendiente: boolean
}

type Producto = {
  producto: string
  documentos: number
  unidades: number
  ventas: number
  margen: number
  base_coste: number
  lineas_pendientes: number
}

type Factura = {
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

type ClienteMes = {
  cliente: string
  documentos: number
  ventas: number
  margen: number
  base_coste: number
  ventas_dia: number
  lineas_pendientes: number
}

type Totales = { documentos: number; ventas: number; margen: number; base_coste: number; lineas_pendientes?: number }

type Informe = {
  fecha: string
  mes_desde: string
  dia: Totales
  mes_total: Totales
  facturas: Factura[]
  productos_dia: Producto[]
  clientes_mes: ClienteMes[]
}

function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { ...cors, 'content-type': 'application/json' } })
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) throw new Error('jwt sin payload')
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - b64.length % 4) % 4
  return JSON.parse(atob(b64 + '='.repeat(pad)))
}

async function checkAuth(req: Request): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, msg: 'falta Authorization' }
  let payload: Record<string, unknown>
  try { payload = decodeJwtPayload(token) } catch { return { ok: false, status: 401, msg: 'jwt inválido' } }
  const role = String(payload.role ?? '')
  if (role === 'service_role') return { ok: true }
  if (role !== 'authenticated') return { ok: false, status: 403, msg: `rol JWT: ${role}` }
  const sub = String(payload.sub ?? '')
  if (!sub) return { ok: false, status: 403, msg: 'jwt sin sub' }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sub}&select=role`, { headers: dbHeaders })
  if (!res.ok) return { ok: false, status: 500, msg: `profiles ${res.status}` }
  const rows = await res.json() as Array<{ role?: string }>
  if (!['admin_full', 'admin_op'].includes(rows[0]?.role ?? '')) return { ok: false, status: 403, msg: 'solo admin' }
  return { ok: true }
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: dbHeaders, body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`rpc ${name} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return await res.json() as T
}

async function logEnvio(row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/informe_margen_envios`, {
    method: 'POST', headers: { ...dbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(row),
  })
  if (!res.ok) console.error(`informe-margen: log ${res.status}`)
}

async function yaEnviado(fecha: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/informe_margen_envios?fecha=eq.${fecha}&estado=eq.ok&select=id&limit=1`,
    { headers: dbHeaders },
  )
  if (!res.ok) return false
  return ((await res.json()) as unknown[]).length > 0
}

function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const eurFmt = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
const eur = (n: number) => `${eurFmt.format(Number(n ?? 0))} €`
const numFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' })
const num = (n: number | null) => n === null || n === undefined ? '—' : numFmt.format(Number(n))
const eur3 = (n: number | null) => n === null || n === undefined ? '—' : `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(Number(n))} €`
const pct = (margen: number, base: number) => Number(base) > 0 ? (100 * Number(margen)) / Number(base) : null
const pctTxt = (p: number | null) => p === null ? '—' : `${p.toFixed(1).replace('.', ',')}%`
const fechaLarga = (iso: string) => new Intl.DateTimeFormat('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${iso}T00:00:00Z`))
const SUBTIPO: Record<string, string> = { invoice: 'Factura', salesreceipt: 'Ticket', waybill: 'Albarán' }

// Helvetica estándar = WinAnsi: se quitan caracteres que no puede codificar.
function safe(s: string): string {
  return String(s ?? '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u20AC\u2026]/g, '')
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const C = {
  ink: rgb(0.11, 0.13, 0.12),
  muted: rgb(0.42, 0.45, 0.43),
  line: rgb(0.86, 0.88, 0.86),
  zebra: rgb(0.96, 0.97, 0.96),
  group: rgb(0.88, 0.93, 0.89),
  green: rgb(0.09, 0.40, 0.24),
  greenBg: rgb(0.09, 0.40, 0.24),
  red: rgb(0.72, 0.13, 0.13),
  amber: rgb(0.66, 0.42, 0.02),
  white: rgb(1, 1, 1),
}

type Col = { title: string; width: number; align?: 'left' | 'right' }
type Cell = { text: string; color?: ReturnType<typeof rgb>; bold?: boolean }
type Group = { group: string; right?: string; rightColor?: ReturnType<typeof rgb> }
type Row = Cell[] | Group

class Doc {
  pdf!: PDFDocument
  font!: PDFFont
  bold!: PDFFont
  page!: PDFPage
  y = 0
  readonly W = 595.28
  readonly H = 841.89
  readonly M = 32

  static async create(): Promise<Doc> {
    const d = new Doc()
    d.pdf = await PDFDocument.create()
    d.font = await d.pdf.embedFont(StandardFonts.Helvetica)
    d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold)
    d.newPage()
    return d
  }

  newPage() {
    this.page = this.pdf.addPage([this.W, this.H])
    this.y = this.H - this.M
  }

  ensure(h: number, onBreak?: () => void) {
    if (this.y - h < this.M + 16) {
      this.newPage()
      onBreak?.()
    }
  }

  text(s: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
    this.page.drawText(safe(s), { x, y, size, font: opts.bold ? this.bold : this.font, color: opts.color ?? C.ink })
  }

  fit(s: string, width: number, size: number, bold = false): string {
    const f = bold ? this.bold : this.font
    let t = safe(s)
    if (f.widthOfTextAtSize(t, size) <= width) return t
    while (t.length > 1 && f.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1)
    return `${t}…`
  }

  kpis(items: Array<{ label: string; value: string; color?: ReturnType<typeof rgb> }>) {
    const gap = 6
    const w = (this.W - 2 * this.M - gap * (items.length - 1)) / items.length
    const h = 40
    this.ensure(h + 8)
    items.forEach((it, i) => {
      const x = this.M + i * (w + gap)
      this.page.drawRectangle({ x, y: this.y - h, width: w, height: h, color: C.zebra, borderColor: C.line, borderWidth: 0.5 })
      this.text(it.label.toUpperCase(), x + 7, this.y - 13, 6.5, { color: C.muted, bold: true })
      this.text(it.value, x + 7, this.y - 31, 12, { bold: true, color: it.color })
    })
    this.y -= h + 12
  }

  heading(s: string, sub?: string) {
    this.ensure(40)
    this.text(s, this.M, this.y - 12, 11, { bold: true, color: C.green })
    if (sub) this.text(sub, this.M, this.y - 23, 7.5, { color: C.muted })
    this.y -= sub ? 30 : 20
  }

  table(cols: Col[], rows: Row[], total?: Cell[]) {
    const rowH = 13
    const size = 7.5
    const header = () => {
      this.page.drawRectangle({ x: this.M, y: this.y - rowH, width: this.W - 2 * this.M, height: rowH, color: C.greenBg })
      let x = this.M
      for (const c of cols) {
        const t = this.fit(c.title, c.width - 6, 6.8, true)
        const tx = c.align === 'right' ? x + c.width - 3 - this.bold.widthOfTextAtSize(t, 6.8) : x + 3
        this.text(t, tx, this.y - 9.2, 6.8, { bold: true, color: C.white })
        x += c.width
      }
      this.y -= rowH
    }
    this.ensure(rowH * 3)
    header()
    const drawRow = (cells: Cell[], i: number, isTotal = false) => {
      this.ensure(rowH, header)
      if (isTotal) {
        this.page.drawLine({ start: { x: this.M, y: this.y }, end: { x: this.W - this.M, y: this.y }, thickness: 0.8, color: C.ink })
      } else if (i % 2 === 1) {
        this.page.drawRectangle({ x: this.M, y: this.y - rowH, width: this.W - 2 * this.M, height: rowH, color: C.zebra })
      }
      let x = this.M
      cells.forEach((cell, ci) => {
        const col = cols[ci]
        const bold = isTotal || cell.bold
        const t = this.fit(cell.text, col.width - 6, size, bold)
        const f = bold ? this.bold : this.font
        const tx = col.align === 'right' ? x + col.width - 3 - f.widthOfTextAtSize(t, size) : x + 3
        this.text(t, tx, this.y - 9.2, size, { bold, color: cell.color })
        x += col.width
      })
      this.y -= rowH
    }
    const drawGroup = (g: Group) => {
      this.ensure(rowH * 2, header)
      this.page.drawRectangle({ x: this.M, y: this.y - rowH, width: this.W - 2 * this.M, height: rowH, color: C.group })
      const right = g.right ? safe(g.right) : ''
      const rw = right ? this.bold.widthOfTextAtSize(right, size) : 0
      this.text(this.fit(g.group, this.W - 2 * this.M - rw - 16, size, true), this.M + 3, this.y - 9.2, size, { bold: true })
      if (right) this.text(right, this.W - this.M - 3 - rw, this.y - 9.2, size, { bold: true, color: g.rightColor })
      this.y -= rowH
    }
    let zebra = 0
    rows.forEach((r) => {
      if (Array.isArray(r)) drawRow(r, zebra++)
      else { drawGroup(r); zebra = 0 }
    })
    if (total) drawRow(total, 0, true)
    this.y -= 14
  }

  footer(label: string) {
    const pages = this.pdf.getPages()
    pages.forEach((p, i) => {
      const t = safe(`${label} · ${i + 1} / ${pages.length}`)
      p.drawText(t, { x: this.M, y: 16, size: 6.5, font: this.font, color: C.muted })
    })
  }
}

function colorPct(p: number | null) {
  if (p === null) return C.muted
  if (p < MARGEN_BAJO_PCT) return C.red
  return C.green
}

async function buildPdf(inf: Informe): Promise<Uint8Array> {
  const d = await Doc.create()
  const pDia = pct(inf.dia.margen, inf.dia.base_coste)
  const pMes = pct(inf.mes_total.margen, inf.mes_total.base_coste)

  d.text('Frutas Abocados · Informe diario de margen', d.M, d.y - 14, 15, { bold: true })
  d.text(`${fechaLarga(inf.fecha)} · facturas, tickets y albaranes · importes sin IVA`, d.M, d.y - 28, 8, { color: C.muted })
  d.y -= 42

  d.kpis([
    { label: 'Ventas del día', value: eur(inf.dia.ventas) },
    { label: 'Margen del día', value: eur(inf.dia.margen) },
    { label: 'Margen % del día', value: pctTxt(pDia), color: colorPct(pDia) },
    { label: 'Documentos', value: String(inf.dia.documentos) },
  ])
  d.kpis([
    { label: 'Ventas del mes', value: eur(inf.mes_total.ventas) },
    { label: 'Margen del mes', value: eur(inf.mes_total.margen) },
    { label: 'Margen % del mes', value: pctTxt(pMes), color: colorPct(pMes) },
    { label: 'Clientes del mes', value: String(inf.clientes_mes.length) },
  ])

  d.heading(
    'Productos del día',
    'Todas las facturas y albaranes del día agrupados por producto, ordenados por venta. Precio y coste medios por unidad.',
  )
  d.table(
    [
      { title: 'Producto', width: 205 },
      { title: 'Docs', width: 30, align: 'right' },
      { title: 'Uds', width: 46, align: 'right' },
      { title: 'Precio medio', width: 54, align: 'right' },
      { title: 'Ventas', width: 64, align: 'right' },
      { title: 'Margen', width: 58, align: 'right' },
      { title: 'Margen %', width: 42, align: 'right' },
      { title: 'Sin coste', width: 32, align: 'right' },
    ],
    inf.productos_dia.map((p) => {
      const pc = pct(p.margen, p.base_coste)
      return [
        { text: p.producto },
        { text: String(p.documentos) },
        { text: num(p.unidades) },
        { text: p.unidades ? eur3(p.ventas / p.unidades) : '—' },
        { text: eur(p.ventas) },
        { text: eur(p.margen) },
        { text: pctTxt(pc), color: colorPct(pc), bold: true },
        { text: p.lineas_pendientes ? String(p.lineas_pendientes) : '—', color: p.lineas_pendientes ? C.amber : C.muted },
      ]
    }),
    [
      { text: `${inf.productos_dia.length} productos` }, { text: '' }, { text: '' }, { text: '' },
      { text: eur(inf.dia.ventas) }, { text: eur(inf.dia.margen) },
      { text: pctTxt(pDia), color: colorPct(pDia) }, { text: '' },
    ],
  )

  d.heading(
    'Factura a factura',
    `Margen % sobre ventas con coste resuelto. En rojo, por debajo del ${MARGEN_BAJO_PCT}%. "Sin coste" = líneas sin coste de compra (suman venta, margen 0).`,
  )
  const colsDia: Col[] = [
    { title: 'Documento', width: 58 },
    { title: 'Tipo', width: 42 },
    { title: 'Cliente', width: 205 },
    { title: 'Ventas', width: 64, align: 'right' },
    { title: 'Margen', width: 60, align: 'right' },
    { title: 'Margen %', width: 46, align: 'right' },
    { title: 'Sin coste', width: 56, align: 'right' },
  ]
  const facturas = [...inf.facturas].sort((a, b) =>
    (pct(a.margen, a.base_coste) ?? 999) - (pct(b.margen, b.base_coste) ?? 999))
  d.table(
    colsDia,
    facturas.map((f) => {
      const p = pct(f.margen, f.base_coste)
      return [
        { text: f.doc_number },
        { text: SUBTIPO[f.subtipo] ?? f.subtipo, color: C.muted },
        { text: f.cliente },
        { text: eur(f.ventas) },
        { text: eur(f.margen) },
        { text: pctTxt(p), color: colorPct(p), bold: true },
        { text: f.lineas_pendientes ? `${f.lineas_pendientes}/${f.lineas}` : '—', color: f.lineas_pendientes ? C.amber : C.muted },
      ]
    }),
    [
      { text: 'TOTAL' }, { text: '' }, { text: `${inf.dia.documentos} documentos` },
      { text: eur(inf.dia.ventas) }, { text: eur(inf.dia.margen) },
      { text: pctTxt(pDia), color: colorPct(pDia) },
      { text: inf.dia.lineas_pendientes ? String(inf.dia.lineas_pendientes) : '—' },
    ],
  )

  d.heading(
    'Detalle por factura y producto',
    'Cada documento con sus productos. Precio = venta / unidades (con descuento). Coste/u = media ponderada de compras vigente.',
  )
  const detalleRows: Row[] = []
  for (const f of facturas) {
    const pf = pct(f.margen, f.base_coste)
    detalleRows.push({
      group: `${f.doc_number} · ${SUBTIPO[f.subtipo] ?? f.subtipo} · ${f.cliente}`,
      right: `${eur(f.ventas)} · ${eur(f.margen)} · ${pctTxt(pf)}`,
      rightColor: colorPct(pf),
    })
    for (const l of f.detalle ?? []) {
      const pl = l.pendiente ? null : pct(l.margen, l.base_coste)
      detalleRows.push([
        { text: l.producto },
        { text: num(l.unidades) },
        { text: eur3(l.precio) },
        { text: l.coste_unidad === null ? 'sin coste' : eur3(l.coste_unidad), color: l.coste_unidad === null ? C.amber : C.ink },
        { text: eur(l.ventas) },
        { text: eur(l.margen) },
        { text: pctTxt(pl), color: l.pendiente ? C.amber : colorPct(pl), bold: true },
      ])
    }
  }
  d.table(
    [
      { title: 'Producto', width: 219 },
      { title: 'Uds', width: 46, align: 'right' },
      { title: 'Precio', width: 56, align: 'right' },
      { title: 'Coste/u', width: 56, align: 'right' },
      { title: 'Venta', width: 58, align: 'right' },
      { title: 'Margen', width: 54, align: 'right' },
      { title: 'Margen %', width: 42, align: 'right' },
    ],
    detalleRows,
  )

  d.heading('Acumulado del mes por cliente', `Del ${inf.mes_desde} al ${inf.fecha}, ordenado por ventas.`)
  const colsMes: Col[] = [
    { title: 'Cliente', width: 215 },
    { title: 'Docs', width: 34, align: 'right' },
    { title: 'Ventas hoy', width: 60, align: 'right' },
    { title: 'Ventas mes', width: 66, align: 'right' },
    { title: 'Margen mes', width: 62, align: 'right' },
    { title: 'Margen %', width: 46, align: 'right' },
    { title: 'Sin coste', width: 48, align: 'right' },
  ]
  d.table(
    colsMes,
    inf.clientes_mes.map((c) => {
      const p = pct(c.margen, c.base_coste)
      return [
        { text: c.cliente },
        { text: String(c.documentos) },
        { text: c.ventas_dia ? eur(c.ventas_dia) : '—', color: c.ventas_dia ? C.ink : C.muted },
        { text: eur(c.ventas) },
        { text: eur(c.margen) },
        { text: pctTxt(p), color: colorPct(p), bold: true },
        { text: c.lineas_pendientes ? String(c.lineas_pendientes) : '—', color: c.lineas_pendientes ? C.amber : C.muted },
      ]
    }),
    [
      { text: 'TOTAL MES' }, { text: String(inf.mes_total.documentos) }, { text: eur(inf.dia.ventas) },
      { text: eur(inf.mes_total.ventas) }, { text: eur(inf.mes_total.margen) },
      { text: pctTxt(pMes), color: colorPct(pMes) }, { text: '' },
    ],
  )

  const generado = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date())
  d.footer(`Abocados OS · Manager · generado ${generado}`)
  return await d.pdf.save()
}

// ---------------------------------------------------------------------------
// Storage + WhatsApp
// ---------------------------------------------------------------------------

async function subirPdf(path: string, bytes: Uint8Array): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/pdf', 'x-upsert': 'true' },
    body: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
  })
  if (!res.ok) throw new Error(`storage upload ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

async function firmarUrl(path: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST', headers: dbHeaders, body: JSON.stringify({ expiresIn: LINK_TTL_SECONDS }),
  })
  if (!res.ok) throw new Error(`storage sign ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const { signedURL } = await res.json() as { signedURL: string }
  return `${SUPABASE_URL}/storage/v1${signedURL}`
}

function tokenAleatorio(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => abc[b % abc.length]).join('')
}

async function enlaceCorto(path: string): Promise<string> {
  const token = tokenAleatorio()
  const res = await fetch(`${SUPABASE_URL}/rest/v1/informe_margen_links`, {
    method: 'POST',
    headers: { ...dbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ token, storage_path: path, expira_at: new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString() }),
  })
  if (!res.ok) throw new Error(`link ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return `${SUPABASE_URL}/functions/v1/informe-margen-pdf?t=${token}`
}

async function enviarWhatsApp(text: string): Promise<string> {
  const cfg = await rpc<{ phone: string | null; apikey: string | null }>('informe_margen_callmebot_config', {})
  if (!cfg.phone || !cfg.apikey) throw new Error('callmebot no configurado en Vault')
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(cfg.phone)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(cfg.apikey)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  const body = (await res.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  // CallMeBot responde 200 aunque rechace: el veredicto va en el cuerpo.
  if (!res.ok || /not sent|not delivered|invalid|error|denied|exceeded|quota/i.test(body)) {
    throw new Error(`callmebot ${res.status}: ${body.slice(-160)}`)
  }
  return body.slice(-300)
}

function mensaje(inf: Informe, link: string): string {
  const pDia = pct(inf.dia.margen, inf.dia.base_coste)
  const pMes = pct(inf.mes_total.margen, inf.mes_total.base_coste)
  const bajos = inf.facturas.filter((f) => {
    const p = pct(f.margen, f.base_coste)
    return p !== null && p < MARGEN_BAJO_PCT
  }).length
  return [
    `Informe margen ${inf.fecha}`,
    `Hoy: ${eur(inf.dia.ventas)} · margen ${eur(inf.dia.margen)} (${pctTxt(pDia)}) · ${inf.dia.documentos} docs`,
    `Mes: ${eur(inf.mes_total.ventas)} · margen ${eur(inf.mes_total.margen)} (${pctTxt(pMes)})`,
    bajos ? `${bajos} docs por debajo del ${MARGEN_BAJO_PCT}%` : '',
    inf.dia.lineas_pendientes ? `${inf.dia.lineas_pendientes} lineas sin coste` : '',
    `PDF: ${link}`,
  ].filter(Boolean).join('\n')
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonRes({ error: 'solo POST' }, 405)

  const auth = await checkAuth(req)
  if (!auth.ok) return jsonRes({ error: auth.msg }, auth.status)

  const body = await req.json().catch(() => ({})) as { fecha?: string; trigger?: string; send?: boolean; force?: boolean }
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha ?? '') ? body.fecha! : hoyMadrid()
  const trigger = String(body.trigger ?? 'manual').slice(0, 40)
  const send = body.send !== false

  if (send && trigger === 'cron' && !body.force && await yaEnviado(fecha)) {
    return jsonRes({ ok: true, skipped: 'ya enviado', fecha })
  }

  let storagePath: string | null = null
  try {
    const inf = await rpc<Informe>('informe_margen_diario', { p_fecha: fecha })
    if (!inf.facturas.length) {
      if (send) await logEnvio({ fecha, trigger, estado: 'sin_ventas' })
      return jsonRes({ ok: true, fecha, sin_ventas: true })
    }
    const pdf = await buildPdf(inf)
    storagePath = `${fecha.slice(0, 7)}/margen-${fecha}.pdf`
    await subirPdf(storagePath, pdf)
    const link = send ? await enlaceCorto(storagePath) : await firmarUrl(storagePath)
    let respuesta: string | null = null
    if (send) respuesta = await enviarWhatsApp(mensaje(inf, link))
    if (send) await logEnvio({ fecha, trigger, estado: 'ok', storage_path: storagePath, respuesta_proveedor: respuesta })
    return jsonRes({ ok: true, fecha, enviado: send, documentos: inf.dia.documentos, storage_path: storagePath, link, respuesta })
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500)
    await logEnvio({ fecha, trigger, estado: 'error', storage_path: storagePath, error: msg })
    return jsonRes({ ok: false, fecha, error: msg }, 500)
  }
})
