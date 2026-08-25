import type { GestoriaColumn, GestoriaFila, GestoriaFiltros } from './types'

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const numero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 })

type ExportInput = {
  rows: GestoriaFila[]
  columns: GestoriaColumn[]
  filtros: GestoriaFiltros
}

function reportTitle(filtros: GestoriaFiltros): string {
  const tipo = filtros.tipo === 'AMBAS' ? 'Compras y ventas' : filtros.tipo === 'COMPRA' ? 'Compras' : 'Ventas'
  const nivel = filtros.nivel === 'documentos' ? 'resumen por documento' : 'detalle por líneas'
  return `${tipo} · ${nivel}`
}

function fileName(filtros: GestoriaFiltros, extension: 'xlsx' | 'pdf'): string {
  const tipo = filtros.tipo.toLowerCase()
  return `gestoria-${tipo}-${filtros.nivel}-${filtros.desde}_${filtros.hasta}.${extension}`
}

function displayValue(row: GestoriaFila, column: GestoriaColumn): string {
  const value = row[column.key]
  if (value == null || value === '') return '—'
  if (column.kind === 'money') return euros.format(Number(value))
  if (column.kind === 'percent') return `${numero.format(Number(value))} %`
  if (column.kind === 'number') return numero.format(Number(value))
  if (column.kind === 'date') {
    const [year, month, day] = String(value).split('-')
    return year && month && day ? `${day}/${month}/${year}` : String(value)
  }
  return String(value)
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4_000)
}

export async function exportGestoriaExcel({ rows, columns, filtros }: ExportInput): Promise<void> {
  const { default: ExcelJSRuntime } = await import('exceljs')
  const workbook = new ExcelJSRuntime.Workbook()
  workbook.creator = 'Abocados OS · Portal Gestoría'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('DATOS CONTABLES', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  sheet.columns = columns.map((column) => ({ key: column.key, width: column.width }))

  const title = sheet.addRow([reportTitle(filtros)])
  sheet.mergeCells(title.number, 1, title.number, columns.length)
  title.font = { bold: true, size: 16, color: { argb: 'FF173C2A' } }
  title.height = 24

  const period = sheet.addRow([`Periodo: ${filtros.desde} — ${filtros.hasta} · ${rows.length} filas`])
  sheet.mergeCells(period.number, 1, period.number, columns.length)
  period.font = { size: 10, color: { argb: 'FF555555' } }

  const notice = sheet.addRow(['Informe generado desde datos contables. No es un documento oficial ni sustituye a las facturas originales.'])
  sheet.mergeCells(notice.number, 1, notice.number, columns.length)
  notice.font = { italic: true, size: 9, color: { argb: 'FF8A5A00' } }

  const header = sheet.addRow(columns.map((column) => column.label.toUpperCase()))
  header.height = 22
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4E2A' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF7AA78B' } } }
  })

  rows.forEach((row, index) => {
    const excelRow = sheet.addRow(columns.map((column) => {
      const value = row[column.key]
      return value == null ? '' : value
    }))
    excelRow.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
      const column = columns[columnIndex - 1]
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF2F6F3' },
      }
      cell.font = { size: 9, color: { argb: 'FF18201B' } }
      cell.alignment = {
        vertical: 'top',
        horizontal: column.kind === 'money' || column.kind === 'number' || column.kind === 'percent' ? 'right' : 'left',
        wrapText: true,
      }
      if (column.kind === 'money') cell.numFmt = '#,##0.00 [$€-es-ES]'
      else if (column.kind === 'percent') cell.numFmt = '0.00" %"'
      else if (column.kind === 'number') cell.numFmt = '#,##0.###'
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD9E3DC' } } }
    })
  })

  sheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: header.number + rows.length, column: columns.length },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  download(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), fileName(filtros, 'xlsx'))
}

export async function exportGestoriaPdf({ rows, columns, filtros }: ExportInput): Promise<void> {
  const jspdfModule = await import('jspdf')
  const JsPDF = (jspdfModule as { jsPDF: typeof import('jspdf').jsPDF }).jsPDF
  const pdf = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 9
  const tableWidth = pageWidth - margin * 2
  const totalWeight = columns.reduce((sum, column) => sum + column.width, 0)
  const widths = columns.map((column) => tableWidth * (column.width / totalWeight))
  const fontSize = columns.length > 9 ? 5.2 : columns.length > 7 ? 5.8 : 6.5
  const lineHeight = fontSize * 0.38
  let y = 0

  const drawReportHeader = () => {
    pdf.setTextColor(23, 60, 42)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.text(reportTitle(filtros), margin, 10)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(80, 80, 80)
    pdf.text(`Periodo ${filtros.desde} — ${filtros.hasta} · ${rows.length} filas`, margin, 15)
    pdf.setTextColor(138, 90, 0)
    pdf.text('Informe generado desde datos contables · No es un documento oficial', pageWidth - margin, 15, { align: 'right' })
    y = 20
  }

  const drawTableHeader = () => {
    let x = margin
    pdf.setFillColor(29, 78, 42)
    pdf.rect(margin, y, tableWidth, 7, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(fontSize)
    columns.forEach((column, index) => {
      const label = pdf.splitTextToSize(column.label.toUpperCase(), Math.max(2, widths[index] - 2)) as string[]
      pdf.text(label.slice(0, 2), x + 1, y + 2.6)
      x += widths[index]
    })
    y += 7
  }

  const newPage = (first = false) => {
    if (!first) pdf.addPage()
    drawReportHeader()
    drawTableHeader()
  }

  newPage(true)

  rows.forEach((row, rowIndex) => {
    const wrapped = columns.map((column, index) => (
      pdf.splitTextToSize(displayValue(row, column), Math.max(2, widths[index] - 2)) as string[]
    ))
    const maxLines = Math.max(1, ...wrapped.map((lines) => lines.length))
    const rowHeight = Math.max(5.2, maxLines * lineHeight + 2.2)
    if (y + rowHeight > pageHeight - 10) newPage()

    pdf.setFillColor(rowIndex % 2 === 0 ? 255 : 243, rowIndex % 2 === 0 ? 255 : 247, rowIndex % 2 === 0 ? 255 : 244)
    pdf.rect(margin, y, tableWidth, rowHeight, 'F')
    pdf.setDrawColor(220, 228, 222)
    pdf.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight)
    pdf.setTextColor(25, 32, 27)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(fontSize)

    let x = margin
    columns.forEach((column, index) => {
      const numeric = column.kind === 'money' || column.kind === 'number' || column.kind === 'percent'
      if (numeric && wrapped[index].length === 1) {
        pdf.text(wrapped[index][0], x + widths[index] - 1, y + 3.4, { align: 'right' })
      } else {
        pdf.text(wrapped[index], x + 1, y + 3.4)
      }
      x += widths[index]
    })
    y += rowHeight
  })

  const pages = pdf.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page)
    pdf.setFontSize(6.5)
    pdf.setTextColor(110, 110, 110)
    pdf.text(`Abocados OS · Gestoría · Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 4, { align: 'right' })
  }

  pdf.save(fileName(filtros, 'pdf'))
}

export function formatGestoriaValue(row: GestoriaFila, column: GestoriaColumn): string {
  return displayValue(row, column)
}
