import type { GestoriaFila, GestoriaFiltros } from './types'
import { createGestoriaDocumentUrl } from './queries'

type ProgressCallback = (current: number, total: number) => void

function hasDocument(row: GestoriaFila): boolean {
  return Boolean(row.pdf_path || row.foto_paths.length > 0)
}

export function gestoriaDocumentKey(row: GestoriaFila): string {
  return [
    row.tipo,
    row.subtipo,
    row.fecha,
    row.numero,
    row.tercero,
    row.pdf_path ?? '',
    row.foto_paths.join(','),
  ].join('|')
}

export function gestoriaRowHasDocument(row: GestoriaFila): boolean {
  return hasDocument(row)
}

function downloadPdf(bytes: Uint8Array, name: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4_000)
}

async function fetchStoredDocument(path: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const url = await createGestoriaDocumentUrl(path)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`no se pudo descargar el archivo (${response.status})`)
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '',
  }
}

export async function downloadGestoriaDocumentBundle(
  rows: GestoriaFila[],
  filtros: GestoriaFiltros,
  onProgress?: ProgressCallback,
): Promise<{ documentos: number; paginas: number }> {
  const selected = rows.filter(hasDocument)
  if (selected.length === 0) throw new Error('Selecciona al menos una factura con archivo')

  const { PDFDocument, rgb } = await import('pdf-lib')
  const output = await PDFDocument.create()
  output.setTitle(`Facturas Gestoría ${filtros.desde} — ${filtros.hasta}`)
  output.setCreator('Abocados OS · Portal Gestoría')
  output.setProducer('Abocados OS')

  for (const [index, row] of selected.entries()) {
    const label = row.numero || `${row.tercero} ${row.fecha}`
    try {
      // Una factura introducida por PDF puede conservar además miniaturas o fotos.
      // El PDF original manda para evitar páginas duplicadas.
      if (row.pdf_path) {
        const file = await fetchStoredDocument(row.pdf_path)
        const source = await PDFDocument.load(file.bytes, { ignoreEncryption: true })
        const pages = await output.copyPages(source, source.getPageIndices())
        pages.forEach((page) => output.addPage(page))
      } else {
        for (const path of row.foto_paths) {
          const file = await fetchStoredDocument(path)
          const png = file.contentType === 'image/png' || path.toLowerCase().endsWith('.png')
          const image = png
            ? await output.embedPng(file.bytes)
            : await output.embedJpg(file.bytes)
          const landscape = image.width > image.height
          const pageWidth = landscape ? 841.89 : 595.28
          const pageHeight = landscape ? 595.28 : 841.89
          const margin = 24
          const scale = Math.min(
            (pageWidth - margin * 2) / image.width,
            (pageHeight - margin * 2) / image.height,
          )
          const width = image.width * scale
          const height = image.height * scale
          const page = output.addPage([pageWidth, pageHeight])
          page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) })
          page.drawImage(image, {
            x: (pageWidth - width) / 2,
            y: (pageHeight - height) / 2,
            width,
            height,
          })
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Factura ${label}: ${detail}`, { cause: error })
    }
    onProgress?.(index + 1, selected.length)
  }

  const paginas = output.getPageCount()
  if (paginas === 0) throw new Error('Las facturas seleccionadas no contienen páginas descargables')
  const bytes = await output.save({ useObjectStreams: true })
  downloadPdf(bytes, `facturas-gestoria-${filtros.desde}_${filtros.hasta}.pdf`)
  return { documentos: selected.length, paginas }
}
