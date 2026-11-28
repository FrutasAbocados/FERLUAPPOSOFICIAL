// Reconstruye las líneas de texto de un PDF agrupando los fragmentos por altura,
// como hace `pdftotext -layout`. pdfjs se carga solo cuando se usa.

type Fragmento = { str: string; transform: number[] }
type DocumentoPdf = {
  numPages: number
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
}

export async function lineasDePaginas(doc: DocumentoPdf): Promise<string[]> {
  const lineas: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const { items } = await page.getTextContent()
    const filas: { y: number; partes: { x: number; s: string }[] }[] = []
    for (const item of items as Fragmento[]) {
      if (typeof item.str !== 'string' || !item.str.trim()) continue
      const x = item.transform[4]
      const y = item.transform[5]
      let fila = filas.find((f) => Math.abs(f.y - y) < 2)
      if (!fila) {
        fila = { y, partes: [] }
        filas.push(fila)
      }
      fila.partes.push({ x, s: item.str.trim() })
    }
    filas.sort((a, b) => b.y - a.y)
    for (const f of filas) lineas.push(f.partes.sort((a, b) => a.x - b.x).map((q) => q.s).join('  '))
  }
  return lineas
}

export async function lineasDePdf(archivo: ArrayBuffer): Promise<string[]> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const tarea = pdfjs.getDocument({ data: new Uint8Array(archivo) })
  try {
    return await lineasDePaginas(await tarea.promise)
  } finally {
    await tarea.destroy()
  }
}
