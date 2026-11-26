export const DOCUMENTACION_BUCKET = 'documentacion-empresa'

export const CATEGORIAS = [
  { key: 'societario', label: 'Societario', hint: 'Escrituras, estatutos, poderes, titularidad real' },
  { key: 'censal', label: 'Censal · NIF', hint: 'NIF/CIF, modelos 036 y 037' },
  { key: 'iva', label: 'IVA', hint: 'Modelos 303 y 390' },
  { key: 'sociedades', label: 'Impuesto sobre Sociedades', hint: 'Modelos 200 y 202' },
  { key: 'otros_impuestos', label: 'Otros impuestos', hint: '111, 115, 180, 190, 347…' },
  { key: 'contabilidad', label: 'Contabilidad', hint: 'Balances, pérdidas y ganancias, cuentas anuales' },
  { key: 'licencias', label: 'Licencias y registros', hint: 'Registro sanitario, anexos, tasas' },
  { key: 'bancos_seguros', label: 'Bancos y seguros', hint: 'Certificados de titularidad, pólizas' },
  { key: 'notificaciones', label: 'Notificaciones', hint: 'Notificaciones y requerimientos' },
  { key: 'otros', label: 'Otros', hint: 'Resto de documentación de la empresa' },
] as const

export type Categoria = (typeof CATEGORIAS)[number]['key']

export const ESTADOS = [
  { key: 'presentado', label: 'Presentado', tone: 'mint' },
  { key: 'borrador', label: 'Borrador', tone: 'amber' },
  { key: 'copia_autorizada', label: 'Copia autorizada', tone: 'mint' },
  { key: 'copia_simple', label: 'Copia simple', tone: 'dim' },
  { key: 'inscrita', label: 'Inscrita', tone: 'mint' },
  { key: 'original', label: 'Original', tone: 'dim' },
  { key: 'informativo', label: 'Informativo', tone: 'dim' },
] as const

export type Estado = (typeof ESTADOS)[number]['key']

export const PERIODOS = ['0A', '1T', '2T', '3T', '4T', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const

export const periodoLabel = (p: string | null): string =>
  p == null ? '—' : p === '0A' ? 'Anual' : p

export interface OrigenRef {
  hilo?: string
  mensaje?: string
  adjunto?: string
  remitente?: string
  fecha?: string
  asunto?: string
  otros_mensajes?: string[]
}

export interface DocumentoEmpresa {
  id: string
  categoria: Categoria
  tipo: string
  modelo: string | null
  titulo: string
  ejercicio: number | null
  periodo: string | null
  fecha_documento: string | null
  estado: Estado
  entidad_nif: string
  csv_aeat: string | null
  justificante: string | null
  storage_path: string
  nombre_original: string
  mime_type: string | null
  bytes: number | null
  sha256: string
  origen: 'gmail' | 'subida'
  origen_ref: OrigenRef | null
  notas: string | null
  created_at: string
}

export type DocumentoEditable = Pick<
  DocumentoEmpresa,
  'categoria' | 'tipo' | 'modelo' | 'titulo' | 'ejercicio' | 'periodo' | 'fecha_documento' | 'estado' | 'csv_aeat' | 'justificante' | 'notas'
>

export const formatBytes = (n: number | null): string => {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** Enlace al mensaje de Gmail de origen (cuenta de la empresa). */
export const gmailUrl = (ref: OrigenRef | null): string | null =>
  ref?.mensaje ? `https://mail.google.com/mail/u/0/#all/${ref.mensaje}` : null
