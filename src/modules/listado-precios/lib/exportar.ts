// Exportación del Listado de Precios: PDF (descarga directa) y envío por WhatsApp.
// Las librerías pesadas (html2canvas-pro, jspdf) se importan de forma diferida
// para no penalizar la carga inicial de la app.

import { buildPageMarkup, buildStandaloneHtml, CATALOG_CSS, pdfFileName, type ListadoDoc } from './catalogo'

// Renderiza el catálogo en un contenedor oculto y genera un Blob PDF A4 multipágina.
export async function buildCatalogPdfBlob(doc: ListadoDoc): Promise<Blob> {
  const [{ default: html2canvas }, jspdfMod] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])
  const JsPDF = (jspdfMod as { jsPDF: typeof import('jspdf').jsPDF }).jsPDF

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:980px;background:#fff;z-index:-1;'
  const style = document.createElement('style')
  style.textContent = CATALOG_CSS
  host.appendChild(style)
  const wrap = document.createElement('div')
  wrap.innerHTML = buildPageMarkup(doc)
  host.appendChild(wrap)
  document.body.appendChild(host)

  try {
    const node = wrap.firstElementChild as HTMLElement
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: 980,
    })

    const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = 210
    const pageH = 297
    const imgW = pageW
    const imgH = (canvas.height * imgW) / canvas.width
    let heightLeft = imgH
    let position = 0
    const imgData = canvas.toDataURL('image/jpeg', 0.92)

    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
    heightLeft -= pageH
    while (heightLeft > 0) {
      position -= pageH
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
      heightLeft -= pageH
    }
    return pdf.output('blob')
  } finally {
    document.body.removeChild(host)
  }
}

// Descarga el PDF en el dispositivo.
export async function exportarPdf(doc: ListadoDoc): Promise<void> {
  const blob = await buildCatalogPdfBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = pdfFileName(doc)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// Abre una ventana de impresión con el documento de marca (alta fidelidad).
export function imprimir(doc: ListadoDoc): void {
  const w = window.open('', '_blank', 'width=900,height=1200')
  if (!w) return
  w.document.open()
  w.document.write(buildStandaloneHtml(doc))
  w.document.close()
  w.focus()
  setTimeout(() => {
    try {
      w.print()
    } catch {
      /* el usuario puede imprimir manualmente */
    }
  }, 600)
}

export type WhatsAppResult = 'shared' | 'downloaded'

// Envía el catálogo por WhatsApp.
// · Móvil con Web Share API + ficheros → comparte el PDF directamente (sale el selector de chat).
// · Resto → descarga el PDF y abre WhatsApp Web para adjuntarlo.
export async function enviarWhatsApp(doc: ListadoDoc): Promise<WhatsAppResult> {
  const blob = await buildCatalogPdfBlob(doc)
  const fileName = pdfFileName(doc)
  const file = new File([blob], fileName, { type: 'application/pdf' })
  const texto = `Catálogo de Precios · ${doc.vigencia} — Frutas y Verduras Abocados S.L.`

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
  }

  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: 'Listado de Precios Abocados', text: texto })
      return 'shared'
    } catch (e) {
      // Si el usuario cancela el diálogo nativo no hacemos fallback.
      if ((e as DOMException)?.name === 'AbortError') return 'shared'
    }
  }

  // Fallback escritorio: descargar PDF + abrir WhatsApp Web con el texto.
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  return 'downloaded'
}
