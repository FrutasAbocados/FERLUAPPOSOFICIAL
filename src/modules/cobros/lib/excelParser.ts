import type ExcelJS from 'exceljs'
import { isValid, parseISO } from 'date-fns'
import { calcVencimiento, excelSerialToDate, isoDate } from './utils'
import type { FormaPago, MetodoCobro } from './types'
import type { ImportPayload } from './queries'

const FORMA_PAGO_MAP: Record<string, FormaPago> = {
  contado: 'Contado',
  '1 día': '1_dia',
  '1 dia': '1_dia',
  '7 días': '7_dias',
  '7 dias': '7_dias',
  '30 días': '30_dias',
  '30 dias': '30_dias',
  'semanal v.': 'Semanal_V',
  'semanal v': 'Semanal_V',
  semanal: 'Semanal_V',
  'mensual v.': 'Mensual_V',
  'mensual v': 'Mensual_V',
  mensual: 'Mensual_V',
}

const METODO_MAP: Record<string, MetodoCobro> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  bizum: 'Bizum',
}

const norm = (v: unknown) =>
  typeof v === 'string' ? v.trim().toLowerCase() : ''

function parseFormaPago(v: unknown): FormaPago {
  const k = norm(v)
  return FORMA_PAGO_MAP[k] ?? 'Contado'
}

function parseMetodo(v: unknown): MetodoCobro | null {
  const k = norm(v)
  if (!k) return null
  return METODO_MAP[k] ?? 'Otro'
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return v
  if (typeof v === 'number' && Number.isFinite(v)) return excelSerialToDate(v)
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    // ISO 8601: yyyy-mm-dd, yyyy-mm-ddTHH:MM:SS…
    const iso = parseISO(s)
    if (isValid(iso)) return iso
    // dd/mm/yyyy o dd-mm-yyyy o dd.mm.yyyy (formato europeo del Excel)
    const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
    if (m) {
      const day = parseInt(m[1], 10)
      const month = parseInt(m[2], 10) - 1
      let year = parseInt(m[3], 10)
      if (year < 100) year += 2000
      const d = new Date(year, month, day)
      if (isValid(d)) return d
    }
  }
  return null
}

function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const cleaned = v.replace(/[€\s]/g, '').replace(',', '.')
    const n = parseFloat(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const PAGADO_TRUTHY = new Set(['pagado', 'sí', 'si', 'cobrado', 'true', 'yes'])

function parsePagado(v: unknown, fechaCobro: Date | null): boolean {
  // Regla del prompt: "Pagado (Sí/No)" puede contener basura como nombres de cliente.
  // Si no es un valor reconocido como pagado, depende de si hay fecha_cobro.
  const k = norm(v)
  if (PAGADO_TRUTHY.has(k)) return true
  return fechaCobro != null
}

export type ParseError = {
  hoja: string
  fila: number
  motivo: string
}

export type ParseResult = ImportPayload & {
  errores: ParseError[]
  resumen: {
    clientes: number
    facturasPendientes: number
    facturasCobradas: number
  }
}

// ─── Lectura con exceljs ──
// Sustituye a la librería `xlsx` (CVE sin parche en npm; este parser procesa
// archivos subidos por el usuario). exceljs solo lee .xlsx — los .xls antiguos
// (contenedor OLE2) se detectan por magic bytes y se rechazan con instrucción clara.

const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

function esXlsAntiguo(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 8))
  return bytes.length === 8 && OLE2_MAGIC.every((b, i) => bytes[i] === b)
}

// Normaliza un CellValue de exceljs al primitivo que esperan los parsers
// (string | number | boolean | Date | null). Fórmulas → su resultado; celdas
// de error → su código ('#REF!'); richText / hyperlink → texto plano.
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>
    if ('error' in o) return String(o.error)
    if ('result' in o) return cellValue(o.result as ExcelJS.CellValue)
    if ('richText' in o) return (o.richText as { text: string }[]).map((r) => r.text).join('')
    if ('text' in o) return cellValue(o.text as ExcelJS.CellValue)
    return null
  }
  return v
}

type RowRecord = Record<string, unknown>

// Equivalente a XLSX.utils.sheet_to_json: cada fila como objeto clave=cabecera
// (fila 1, sin trim — 'Cliente. ' con espacio se respeta). Columnas sin cabecera
// reciben __EMPTY, __EMPTY_1, __EMPTY_2… (mismo naming que usaba xlsx).
// `fila` es el número real de fila en el Excel (para los avisos).
function sheetToRows(ws: ExcelJS.Worksheet): { row: RowRecord; fila: number }[] {
  const headerRow = ws.getRow(1)
  const headers: string[] = []
  let emptyCount = 0
  for (let c = 1; c <= ws.columnCount; c++) {
    const raw = cellValue(headerRow.getCell(c).value)
    const name = raw == null ? '' : String(raw)
    if (name !== '') {
      headers[c] = name
    } else {
      headers[c] = emptyCount === 0 ? '__EMPTY' : `__EMPTY_${emptyCount}`
      emptyCount++
    }
  }
  const rows: { row: RowRecord; fila: number }[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const rec: RowRecord = {}
    let hasValue = false
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = cellValue(row.getCell(c).value)
      rec[headers[c]] = v
      if (v != null && v !== '') hasValue = true
    }
    if (hasValue) rows.push({ row: rec, fila: rowNumber })
  })
  return rows
}

export async function parseExcel(buffer: ArrayBuffer): Promise<ParseResult> {
  if (esXlsAntiguo(buffer)) {
    throw new Error(
      'Formato .xls antiguo no soportado. Abre el archivo en Excel y guárdalo como .xlsx (Libro de Excel).',
    )
  }
  const { default: ExcelJSLib } = await import('exceljs')
  const wb = new ExcelJSLib.Workbook()
  await wb.xlsx.load(buffer)

  const errores: ParseError[] = []
  const clientesMap = new Map<string, ImportPayload['clientes'][number]>()
  const movimientos: ImportPayload['movimientos'] = []

  // ─── Hoja Clientes ──
  const sheetClientes = wb.getWorksheet('Clientes')
  if (sheetClientes) {
    sheetToRows(sheetClientes).forEach(({ row, fila }) => {
      const nombre = typeof row['Cliente'] === 'string' ? (row['Cliente'] as string).trim() : ''
      if (!nombre) return
      const formaPago = parseFormaPago(row['Forma de Pago'])
      const metodo = parseMetodo(row['Método Cobro Preferido'])
      clientesMap.set(nombre, {
        nombre,
        forma_pago: formaPago,
        metodo_cobro_preferido: metodo,
        activo: true,
      })
      // Validación blanda: filas con #REF! u otros errores
      const v = row['__EMPTY_2']
      if (typeof v === 'string' && v.startsWith('#')) {
        errores.push({ hoja: 'Clientes', fila, motivo: `Celda con error: ${v}` })
      }
    })
  } else {
    errores.push({ hoja: 'Clientes', fila: 0, motivo: 'Hoja "Clientes" no encontrada' })
  }

  // Función común para parsear hojas de facturas
  const parseFacturas = (sheetName: string, esArchivado: boolean) => {
    const sheet = wb.getWorksheet(sheetName)
    if (!sheet) return 0
    let count = 0
    sheetToRows(sheet).forEach(({ row, fila }) => {
      const clienteName = (row['Cliente. '] ?? row['Cliente']) as unknown
      const nombre = typeof clienteName === 'string' ? clienteName.trim() : ''
      if (!nombre) return

      // Nº Factura puede venir como número (ej. 261288) o string. Normalizamos.
      const rawNum = row['Nº Factura']
      const numFactura: string | null =
        rawNum == null
          ? null
          : typeof rawNum === 'number'
            ? String(rawNum)
            : typeof rawNum === 'string'
              ? rawNum.trim() || null
              : null
      const fechaFactura = parseDate(row['Fecha Factura'])
      if (!fechaFactura) {
        errores.push({
          hoja: sheetName,
          fila,
          motivo: `Fecha factura inválida (cliente=${nombre}, nº=${numFactura ?? '—'})`,
        })
        return
      }
      const importe = parseNum(row['Importe'])
      if (importe == null) {
        errores.push({
          hoja: sheetName,
          fila,
          motivo: `Importe inválido (cliente=${nombre}, nº=${numFactura ?? '—'})`,
        })
        return
      }
      // Importe negativo = abono / nota de crédito (válido)

      const fechaCobro = parseDate(row['Fecha Cobro'])
      const importeCobrado = parseNum(row['Importe Cobrado'])
      const metodo = parseMetodo(row['Método Cobro'])
      // forma_pago: usa la del cliente si existe, si no la de la fila
      const formaCli = clientesMap.get(nombre)?.forma_pago
      const formaRow = parseFormaPago(row['Forma de Pago'])
      const formaPago: FormaPago = formaCli ?? formaRow
      const pagado = esArchivado ? true : parsePagado(row['Pagado (Sí/No)'], fechaCobro)
      const fechaVenc = parseDate(row['Fecha Vencimiento']) ?? calcVencimiento(fechaFactura, formaPago)

      // Si el cliente no estaba en hoja "Clientes", lo creamos sobre la marcha
      if (!clientesMap.has(nombre)) {
        clientesMap.set(nombre, {
          nombre,
          forma_pago: formaPago,
          metodo_cobro_preferido: metodo,
          activo: true,
        })
      }

      movimientos.push({
        _cliente_nombre: nombre,
        cliente_id: '', // se resuelve en el upsert
        tipo: 'Factura',
        numero_factura: numFactura,
        fecha_factura: isoDate(fechaFactura),
        importe,
        pagado,
        fecha_cobro: fechaCobro ? isoDate(fechaCobro) : null,
        importe_cobrado: pagado && importeCobrado == null ? importe : importeCobrado,
        metodo_cobro: metodo,
        fecha_vencimiento: isoDate(fechaVenc),
        forma_pago_cliente: formaPago,
        concepto: null,
      })
      count++
    })
    return count
  }

  const facturasPendientes = parseFacturas('Facturas', false)
  const facturasCobradas = parseFacturas('Archivados Cobrados Antiguos', true)

  return {
    clientes: Array.from(clientesMap.values()),
    movimientos,
    errores,
    resumen: {
      clientes: clientesMap.size,
      facturasPendientes,
      facturasCobradas,
    },
  }
}
