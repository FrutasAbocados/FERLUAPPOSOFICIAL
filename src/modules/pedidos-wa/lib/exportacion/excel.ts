import type ExcelJS from 'exceljs'
import {
  REPARTIDOR_LABEL,
  UNIDAD_LABEL,
  type Pedido,
  type Repartidor,
} from '../types'
import type { CompraOperativaFila, RutaConfig, RutaExtra } from '../queries'

const REPARTIDOR_ORDER: Repartidor[] = ['TORRES', 'GERMAN', 'RAUL', 'ALEX']

// ── Colores ──────────────────────────────────────────────────────────────────
const C = {
  headerBg:    '1D4E2A',  // verde oscuro
  headerFg:    'FFFFFF',
  sectionBg:   '3A3A3A',  // gris muy oscuro (separador de repartidor)
  sectionFg:   'FFFFFF',
  salidaBg:    '5A5A5A',  // gris oscuro (separador de salida)
  salidaFg:    'FFFFFF',
  rowAlt:      'F2F2F2',  // gris claro para filas alternas
  rowNormal:   'FFFFFF',
  borderColor: '999999',
}

type RowKind = 'header' | 'section' | 'salida' | 'data'

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatN(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function resumenPedido(p: Pedido): string {
  const partes: string[] = []
  if (p.notas_admin) partes.push(`* ${p.notas_admin}`)
  const porSeccion = new Map<string, string[]>()
  for (const l of p.lineas ?? []) {
    const sec = l.subseccion ?? ''
    const txt =
      `${formatN(Number(l.cantidad))} ${UNIDAD_LABEL[l.unidad]} ${l.producto_normalizado}` +
      (l.notas ? ` (${l.notas})` : '') +
      (l.es_gratis ? ' [GRATIS]' : '')
    if (!porSeccion.has(sec)) porSeccion.set(sec, [])
    porSeccion.get(sec)!.push(txt)
  }
  const secciones = [...porSeccion.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [sec, lineas] of secciones) {
    if (sec) partes.push(`${sec}:`)
    partes.push(...lineas)
  }
  return partes.join(' / ')
}

function ordenSalida(s: string | null | undefined): number {
  if (s === 'PRIMERA' || s == null) return 0
  if (s === 'SEGUNDA') return 1
  return 2
}

function ordenarPedidos(pedidos: Pedido[]): Pedido[] {
  return [...pedidos].sort((a, b) => {
    const ra = REPARTIDOR_ORDER.indexOf(a.override_repartidor ?? a.cliente?.repartidor ?? 'ALEX')
    const rb = REPARTIDOR_ORDER.indexOf(b.override_repartidor ?? b.cliente?.repartidor ?? 'ALEX')
    if (ra !== rb) return ra - rb
    const sa = ordenSalida(a.override_salida ?? a.cliente?.salida)
    const sb = ordenSalida(b.override_salida ?? b.cliente?.salida)
    if (sa !== sb) return sa - sb
    if (a.override_orden != null || b.override_orden != null) {
      return (a.override_orden ?? Number.MAX_SAFE_INTEGER) - (b.override_orden ?? Number.MAX_SAFE_INTEGER)
    }
    return (a.override_horario ?? a.cliente?.horario ?? '').localeCompare(b.override_horario ?? b.cliente?.horario ?? '')
  })
}

// ── Aplicar estilo a una fila completa ───────────────────────────────────────
function styleRow(row: ExcelJS.Row, kind: RowKind, altBg: boolean) {
  const border: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: 'FF' + C.borderColor } },
    bottom: { style: 'thin', color: { argb: 'FF' + C.borderColor } },
    left:   { style: 'thin', color: { argb: 'FF' + C.borderColor } },
    right:  { style: 'thin', color: { argb: 'FF' + C.borderColor } },
  }

  row.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.border = border

    if (kind === 'header') {
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.headerBg } }
      cell.font   = { bold: true, color: { argb: 'FF' + C.headerFg }, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    } else if (kind === 'section') {
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.sectionBg } }
      cell.font   = { bold: true, color: { argb: 'FF' + C.sectionFg }, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    } else if (kind === 'salida') {
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.salidaBg } }
      cell.font   = { bold: true, color: { argb: 'FF' + C.salidaFg }, size: 9, italic: true }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    } else {
      // data row
      const bg = altBg ? C.rowAlt : C.rowNormal
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } }
      // cliente (col 1) en negrita
      if (col === 1) {
        cell.font = { bold: true, size: 9 }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      } else if (col === 4 || col === 5) {
        // PEDIDO y FALTAS: wrap y tamaño pequeño
        cell.font = { size: 8 }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      } else {
        cell.font = { size: 9 }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      }
    }
  })

  if (kind === 'header' || kind === 'section' || kind === 'salida') {
    row.height = 20
  }
}

// ── Construir una hoja ────────────────────────────────────────────────────────
function buildSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  pedidos: Pedido[],
  configs: RutaConfig[],
  extras: RutaExtra[],
) {
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      paperSize:   9,  // A4
      orientation: 'landscape',
      fitToPage:   true,
      fitToWidth:  1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  })

  ws.columns = [
    { key: 'cliente',   width: 18 },
    { key: 'horario',   width: 9  },
    { key: 'factura',   width: 9  },
    { key: 'pedido',    width: 52 },
    { key: 'faltas',    width: 28 },
    { key: 'vehiculo',  width: 12 },
    { key: 'reparto',   width: 10 },
  ]

  // Cabecera
  const headerRow = ws.addRow(['CLIENTE', 'HORARIO', 'FACTURA', 'PEDIDO', 'FALTAS', 'VEHÍCULO', 'REPARTO'])
  styleRow(headerRow, 'header', false)

  for (const rep of REPARTIDOR_ORDER) {
    for (const salida of ['PRIMERA', 'SEGUNDA'] as const) {
      const pedidosSeccion = pedidos.filter((p) => (
        (p.override_repartidor ?? p.cliente?.repartidor) === rep &&
        (p.override_salida ?? p.cliente?.salida ?? 'PRIMERA') === salida
      ))
      const extrasSeccion = extras.filter((extra) => extra.repartidor === rep && extra.salida === salida)
      if (pedidosSeccion.length === 0 && extrasSeccion.length === 0) continue

      const vehiculo = configs.find((config) => config.repartidor === rep && config.salida === salida)?.vehiculo ?? ''
      const label = `${salida === 'SEGUNDA' ? 'SEGUNDA SALIDA' : 'SALIDA DEL CAMPO'} · ${REPARTIDOR_LABEL[rep]}${vehiculo ? ` · ${vehiculo}` : ''}`
      const secRow = ws.addRow([label, '', '', '', '', '', ''])
      ws.mergeCells(secRow.number, 1, secRow.number, 7)
      styleRow(secRow, salida === 'SEGUNDA' ? 'salida' : 'section', false)
      let altBg = false

      for (const p of pedidosSeccion) {
        const c = p.cliente
        const dataRow = ws.addRow([
          c?.nombre ?? '—',
          p.override_horario ?? c?.horario ?? '',
          c?.tipo_factura ?? '',
          resumenPedido(p),
          p.faltas ?? '',
          vehiculo,
          REPARTIDOR_LABEL[rep],
        ])
        styleRow(dataRow, 'data', altBg)
        altBg = !altBg
      }
      for (const extra of extrasSeccion) {
        const dataRow = ws.addRow([
          extra.cliente,
          extra.horario ?? '',
          extra.factura ?? '',
          extra.pedido ?? '',
          extra.faltas ?? '',
          vehiculo,
          REPARTIDOR_LABEL[rep],
        ])
        styleRow(dataRow, 'data', altBg)
        altBg = !altBg
      }
    }
  }
}

function buildCompraSheet(wb: ExcelJS.Workbook, proveedor: string, filas: CompraOperativaFila[]) {
  const ws = wb.addWorksheet(`COMPRA ${proveedor.toUpperCase()}`)
  ws.columns = [
    { key: 'producto', width: 30 },
    { key: 'cantidad', width: 16 },
    { key: 'unidad', width: 12 },
    { key: 'necesidad', width: 20 },
  ]
  const header = ws.addRow(['PRODUCTO', 'PEDIR', 'FORMATO', 'NECESIDAD BASE'])
  styleRow(header, 'header', false)
  filas.forEach((fila, index) => {
    const row = ws.addRow([
      fila.producto,
      fila.cantidad_compra,
      fila.unidad_compra,
      `${formatN(fila.a_comprar)} ${fila.unidad}`,
    ])
    styleRow(row, 'data', index % 2 === 1)
  })
}

// ── Export principal ─────────────────────────────────────────────────────────
export async function exportarHojaRuta(
  pedidos: Pedido[],
  fechaIso: string,
  configs: RutaConfig[] = [],
  extras: RutaExtra[] = [],
  compra: CompraOperativaFila[] = [],
) {
  const { default: ExcelJSRuntime } = await import('exceljs')
  const ordenados = ordenarPedidos(pedidos)
  const wb = new ExcelJSRuntime.Workbook()
  wb.creator = 'Abocados OS'
  wb.created = new Date()

  buildSheet(wb, 'RUTA COMPLETA', ordenados, configs, extras)

  for (const rep of REPARTIDOR_ORDER) {
    const subset = ordenados.filter(p => (p.override_repartidor ?? p.cliente?.repartidor) === rep)
    if (subset.length === 0) continue
    buildSheet(wb, REPARTIDOR_LABEL[rep].toUpperCase(), subset, configs, extras.filter((extra) => extra.repartidor === rep))
  }

  for (const proveedor of ['alcalde', 'abasthosur', 'mercado', 'otro']) {
    const filas = compra.filter((fila) => fila.a_comprar > 0 && fila.proveedor === proveedor)
    if (filas.length > 0) buildCompraSheet(wb, proveedor, filas)
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `parte-operativo-${fechaIso}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export type CompraFila = {
  producto: string
  unidad: string
  pedido_total: number
  inventario: number
  a_comprar: number
  pedido_cajas: number | null
  inventario_cajas: number | null
  a_comprar_cajas: number | null
  kg_por_caja: number | null
  cantidad_compra?: number
  unidad_compra?: string
}

export async function exportarCompra(filas: CompraFila[], fechaIso: string) {
  const XLSX = await import('xlsx')
  const HEADER_COMPRA = [
    'PRODUCTO', 'UNIDAD',
    'PEDIDO', 'PEDIDO (cajas)',
    'INVENTARIO', 'INVENTARIO (cajas)',
    'NECESIDAD BASE', 'A COMPRAR (cajas)',
    'PEDIR', 'FORMATO',
    'kg/caja',
  ]
  type Fila = (string | number)[]
  const rows: Fila[] = [HEADER_COMPRA]
  for (const f of filas) {
    rows.push([
      f.producto,
      f.unidad,
      f.pedido_total,
      f.pedido_cajas ?? '',
      f.inventario,
      f.inventario_cajas ?? '',
      f.a_comprar,
      f.a_comprar_cajas ?? '',
      f.cantidad_compra ?? f.a_comprar,
      f.unidad_compra ?? f.unidad,
      f.kg_por_caja ?? '',
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 28 }, { wch: 8 },
    { wch: 10 }, { wch: 12 },
    { wch: 12 }, { wch: 14 },
    { wch: 10 }, { wch: 12 },
    { wch: 12 }, { wch: 14 },
    { wch: 8 },
  ]
  const wbx = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbx, ws, 'COMPRA')
  XLSX.writeFile(wbx, `compra-${fechaIso}.xlsx`)
}
