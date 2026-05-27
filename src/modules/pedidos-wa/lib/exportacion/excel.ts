import type ExcelJS from 'exceljs'
import {
  REPARTIDOR_LABEL,
  UNIDAD_LABEL,
  type Pedido,
  type Repartidor,
} from '../types'

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
    const ra = REPARTIDOR_ORDER.indexOf(a.cliente?.repartidor ?? 'ALEX')
    const rb = REPARTIDOR_ORDER.indexOf(b.cliente?.repartidor ?? 'ALEX')
    if (ra !== rb) return ra - rb
    const sa = ordenSalida(a.cliente?.salida)
    const sb = ordenSalida(b.cliente?.salida)
    if (sa !== sb) return sa - sb
    return (a.cliente?.horario ?? '').localeCompare(b.cliente?.horario ?? '')
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
function buildSheet(wb: ExcelJS.Workbook, sheetName: string, pedidos: Pedido[]) {
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
    { key: 'reparto',   width: 10 },
  ]

  // Cabecera
  const headerRow = ws.addRow(['CLIENTE', 'HORARIO', 'FACTURA', 'PEDIDO', 'FALTAS', 'REPARTO'])
  styleRow(headerRow, 'header', false)

  let altBg = false
  let prevRep: Repartidor | null = null
  let prevSalida: string | null | undefined = undefined

  for (const p of pedidos) {
    const rep = p.cliente?.repartidor ?? null
    const salida = p.cliente?.salida ?? null

    if (rep && rep !== prevRep) {
      if (prevRep !== null) {
        const sepRow = ws.addRow(['', '', '', '', '', ''])
        styleRow(sepRow, 'section', false)
        sepRow.height = 6
      }
      const label = `── ${REPARTIDOR_LABEL[rep as Repartidor]} ──`
      const secRow = ws.addRow([label, '', '', '', '', ''])
      ws.mergeCells(secRow.number, 1, secRow.number, 6)
      styleRow(secRow, 'section', false)
      altBg = false
      prevSalida = undefined
    }

    if (
      (rep === 'GERMAN' || rep === 'RAUL') &&
      salida === 'SEGUNDA' &&
      prevSalida !== 'SEGUNDA' &&
      prevSalida !== undefined
    ) {
      const salRow = ws.addRow(['', '', '', 'Segunda salida', '', ''])
      ws.mergeCells(salRow.number, 1, salRow.number, 6)
      styleRow(salRow, 'salida', false)
    }

    const c = p.cliente
    const dataRow = ws.addRow([
      c?.nombre ?? '—',
      c?.horario ?? '',
      c?.tipo_factura ?? '',
      resumenPedido(p),
      p.faltas ?? '',
      c ? REPARTIDOR_LABEL[c.repartidor] : '',
    ])
    styleRow(dataRow, 'data', altBg)
    altBg = !altBg
    prevRep = rep
    prevSalida = salida
  }
}

// ── Export principal ─────────────────────────────────────────────────────────
export async function exportarHojaRuta(pedidos: Pedido[], fechaIso: string) {
  const { default: ExcelJSRuntime } = await import('exceljs')
  const ordenados = ordenarPedidos(pedidos)
  const wb = new ExcelJSRuntime.Workbook()
  wb.creator = 'Abocados OS'
  wb.created = new Date()

  buildSheet(wb, 'COMPLETA', ordenados)

  for (const rep of REPARTIDOR_ORDER) {
    const subset = ordenados.filter(p => p.cliente?.repartidor === rep)
    if (subset.length === 0) continue
    buildSheet(wb, REPARTIDOR_LABEL[rep].toUpperCase(), subset)
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ruta-${fechaIso}.xlsx`
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
}

export async function exportarCompra(filas: CompraFila[], fechaIso: string) {
  const XLSX = await import('xlsx')
  const HEADER_COMPRA = [
    'PRODUCTO', 'UNIDAD',
    'PEDIDO', 'PEDIDO (cajas)',
    'INVENTARIO', 'INVENTARIO (cajas)',
    'A COMPRAR', 'A COMPRAR (cajas)',
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
      f.kg_por_caja ?? '',
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 28 }, { wch: 8 },
    { wch: 10 }, { wch: 12 },
    { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 14 },
    { wch: 8 },
  ]
  const wbx = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbx, ws, 'COMPRA')
  XLSX.writeFile(wbx, `compra-${fechaIso}.xlsx`)
}
