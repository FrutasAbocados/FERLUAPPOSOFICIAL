// Preparación de fotos de factura para el OCR.
//
// Dos motivos por los que no se puede mandar el File tal cual a Claude:
//  1. El iPhone dispara en HEIC y la API de Claude solo acepta JPEG/PNG/WebP/GIF.
//  2. Una foto de 12 Mpx pesa ~4 MB, y en base64 crece un 33% (límite de 5 MB por imagen).
//
// Repintar en un canvas resuelve ambos: sale JPEG y sale reducida. Todo lo que el
// navegador sepa decodificar (Safari sí decodifica HEIC) acaba en JPEG.

/** Lado máximo. Por encima de ~2000px el OCR no mejora y el base64 se dispara. */
const LADO_MAX = 2000
const CALIDAD = 0.82
/** Límite duro de la API de Claude por imagen, con margen para el overhead de base64. */
const MAX_B64_BYTES = 4_500_000

export type FotoPreparada = {
  b64: string
  media_type: 'image/jpeg'
  /** Para subir a Storage y para la preview local. */
  blob: Blob
  nombre: string
}

async function decodificar(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap es el camino rápido y sin fugas de memoria.
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      // Safari antiguo puede fallar con HEIC aquí; caemos al <img>.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('No se pudo leer la imagen (¿formato HEIC no soportado?)'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Convierte una foto a JPEG reducido, listo para OCR y para Storage. */
export async function prepararFoto(file: File): Promise<FotoPreparada> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" no es una imagen`)
  }

  const src = await decodificar(file)
  const w0 = 'width' in src ? src.width : 0
  const h0 = 'height' in src ? src.height : 0
  if (!w0 || !h0) throw new Error('Imagen vacía o ilegible')

  const escala = Math.min(1, LADO_MAX / Math.max(w0, h0))
  const w = Math.round(w0 * escala)
  const h = Math.round(h0 * escala)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')
  // Fondo blanco: si la foto trae alfa, el JPEG lo pintaría negro.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(src as CanvasImageSource, 0, 0, w, h)
  if ('close' in src) src.close()

  let calidad = CALIDAD
  let blob = await aBlob(canvas, calidad)

  // Una factura muy detallada puede seguir pasándose: baja calidad, nunca resolución.
  while (blob.size * 1.34 > MAX_B64_BYTES && calidad > 0.4) {
    calidad -= 0.15
    blob = await aBlob(canvas, calidad)
  }
  if (blob.size * 1.34 > MAX_B64_BYTES) {
    throw new Error(`La foto de "${file.name}" es demasiado pesada incluso comprimida. Hazla más cerca o con menos resolución.`)
  }

  return {
    b64: await blobABase64(blob),
    media_type: 'image/jpeg',
    blob,
    nombre: file.name.replace(/\.[^.]+$/, '') + '.jpg',
  }
}

function aBlob(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen'))),
      'image/jpeg',
      calidad,
    )
  })
}

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const idx = result.indexOf(',')
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Lectura de imagen falló'))
    reader.readAsDataURL(blob)
  })
}
