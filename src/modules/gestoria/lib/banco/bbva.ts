// Lector del PDF «Movimientos» que descarga la banca online de BBVA.
// Recibe las líneas de texto ya reconstruidas (ver pdfLineas.ts) y devuelve los
// movimientos con importes en céntimos. Cada movimiento ocupa una fila con
// fechas, código, importe y saldo; su concepto va en las líneas de encima y el
// detalle (ordenante, referencia) en las de debajo.

export type CategoriaBanco =
  | 'cobro_transferencia'
  | 'cobro_datafono'
  | 'ingreso_efectivo'
  | 'traspaso_propio'
  | 'prestamo_recibido'
  | 'prestamo_cuota'
  | 'pago_transferencia'
  | 'recibo'
  | 'tarjeta'
  | 'cajero'
  | 'comision'
  | 'impuestos_ss'
  | 'otros'

export type MovimientoBanco = {
  orden: number
  fecha: string // yyyy-MM-dd (fecha contable)
  fechaValor: string
  codigo: string
  concepto: string
  detalle: string
  importeCent: number
  saldoCent: number
  categoria: CategoriaBanco
  facturas: string[]
}

export type ExtractoBanco = {
  banco: 'BBVA'
  titular: string
  iban: string
  movimientos: MovimientoBanco[] // del más antiguo al más reciente
  saldoInicialCent: number
  saldoFinalCent: number
  desde: string
  hasta: string
}

const FILA = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{5})\s*(.*?)\s*(-?[\d.]+(?:,\d{1,2})?) EUR\s+(-?[\d.]+(?:,\d{1,2})?) EUR\s*$/
const CABECERA = /^(TRANSFERENCIA|PAGO CON TARJETA|ADEUDO|LIQUIDACION|CARGO|INGRESO|ABONO|COMISI|RECIBO|DEVOLUCION|TRASPASO|IMPUESTO|SEGUROS|BIZUM|PAGO|CUOTA|DISPOSICION|RETIRADA|REINTEGRO|ENTREGA|EMISION|PRECIO|COBRO|ORDEN|CAJERO)/
// Marcas de página («1 24  /», «1/24») y cabecera del documento.
const RUIDO = /^(\d+\s+\d+\s*\/|\d+\/\d+$|Movimientos$|Titular\s|Cuenta\s|Divisa\s|Banco\s|F\. CONTABLE)/

export function centimos(texto: string): number {
  const limpio = texto.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(limpio)) throw new Error(`Importe no válido: ${texto}`)
  const [entero, dec = ''] = limpio.replace('-', '').split('.')
  const valor = Number(entero) * 100 + Number(dec.padEnd(2, '0'))
  return limpio.startsWith('-') ? -valor : valor
}

export function categorizar(concepto: string, detalle: string, importeCent: number): CategoriaBanco {
  const c = concepto.toUpperCase()
  const d = detalle.toUpperCase()
  if (c.includes('TRASPASO') || d.includes('TRASPASO') || /FERLU/.test(c)) return 'traspaso_propio'
  if (c.includes('DISPOSICION DE PRESTAMO')) return 'prestamo_recibido'
  if (c.includes('AMORTIZACION DE PRESTAMO')) return 'prestamo_cuota'
  if (c.includes('REMESA DE COMERCIOS')) return 'cobro_datafono'
  if (c.includes('SEGURIDAD SOCIAL') || c.includes('TGSS') || c.includes('IMPUESTO') || d.includes('AEAT')) return 'impuestos_ss'
  if (c.includes('TRANSFERENCIA')) return importeCent > 0 ? 'cobro_transferencia' : 'pago_transferencia'
  if (c.includes('INGRESO') || c.includes('ENTREGA') || c.includes('CHEQUE')) return 'ingreso_efectivo'
  if (c.includes('CAJERO')) return 'cajero'
  if (c.includes('TARJETA')) return 'tarjeta'
  if (c.includes('COMISI')) return 'comision'
  if (c.includes('ADEUDO') || c.includes('RECIBO')) return 'recibo'
  return 'otros'
}

export function facturasCitadas(texto: string): string[] {
  const vistos = new Set<string>()
  // Holded numera F + año (26) + 4 cifras: F263333.
  for (const m of texto.toUpperCase().matchAll(/\bF?(2[5-9]\d{4})\b/g)) vistos.add(`F${m[1]}`)
  return [...vistos]
}

/** El PDF trae el número completo de la tarjeta: solo se guardan las 4 últimas cifras. */
export function enmascararTarjetas(texto: string): string {
  return texto.replace(/\b\d{12}(\d{4})\b/g, '************$1')
}

export function leerExtractoBbva(lineas: string[]): ExtractoBanco {
  const texto = lineas.map((l) => l.trim())
  const titular = texto.find((l) => l.startsWith('Titular'))?.replace(/^Titular\s+/, '').replace(/\s+Fecha.*$/, '').trim() ?? ''
  const iban = texto.find((l) => l.startsWith('Cuenta'))?.match(/ES\d{22}/)?.[0] ?? ''
  if (!iban || !texto.some((l) => /BANCO BILBAO VIZCAYA ARGENTARIA/.test(l))) {
    throw new Error('No parece un extracto «Movimientos» de BBVA')
  }

  type Fila = { m: RegExpMatchArray }
  const filas: Fila[] = []
  const bloques: string[][] = [[]]
  for (const l of texto) {
    const m = l.match(FILA)
    if (m) {
      filas.push({ m })
      bloques.push([])
      continue
    }
    if (!l || RUIDO.test(l)) continue
    bloques[bloques.length - 1].push(l)
  }
  if (filas.length === 0) throw new Error('El extracto no tiene movimientos')

  // El PDF va del más reciente al más antiguo.
  const recientes: MovimientoBanco[] = filas.map(({ m }, i) => {
    const antes = bloques[i]
    const despues = bloques[i + 1]
    const k = antes.findIndex((x) => CABECERA.test(x))
    const cabecera = k >= 0 ? antes.slice(k) : []
    const k2 = despues.findIndex((x) => CABECERA.test(x))
    const concepto = [...cabecera, m[8]].join(' ').replace(/\s+/g, ' ').trim()
    const detalleBruto = (k2 >= 0 ? despues.slice(0, k2) : despues).join(' ').trim()
    // Solo los pagos con tarjeta traen el número completo; las referencias de
    // recibos también tienen 16 cifras y no se tocan.
    const detalle = /TARJETA|CAJERO/i.test(concepto) ? enmascararTarjetas(detalleBruto) : detalleBruto
    const importeCent = centimos(m[9])
    return {
      orden: 0,
      fecha: `${m[3]}-${m[2]}-${m[1]}`,
      fechaValor: `${m[6]}-${m[5]}-${m[4]}`,
      codigo: m[7],
      concepto,
      detalle,
      importeCent,
      saldoCent: centimos(m[10]),
      categoria: categorizar(concepto, detalle, importeCent),
      facturas: importeCent > 0 ? facturasCitadas(`${concepto} ${detalle}`) : [],
    }
  })

  const movimientos = recientes.reverse().map((mov, i) => ({ ...mov, orden: i + 1 }))
  const errores = validarSaldos(movimientos)
  if (errores.length > 0) {
    throw new Error(`Los saldos no encadenan en ${errores.length} movimientos (primero: nº ${errores[0]}). No se importa nada.`)
  }
  const primero = movimientos[0]
  const ultimo = movimientos[movimientos.length - 1]
  return {
    banco: 'BBVA',
    titular,
    iban,
    movimientos,
    saldoInicialCent: primero.saldoCent - primero.importeCent,
    saldoFinalCent: ultimo.saldoCent,
    desde: primero.fecha,
    hasta: ultimo.fecha,
  }
}

/** Devuelve el número de orden de cada movimiento cuyo saldo no sale del anterior. */
export function validarSaldos(movimientos: MovimientoBanco[]): number[] {
  const errores: number[] = []
  for (let i = 1; i < movimientos.length; i++) {
    if (movimientos[i - 1].saldoCent + movimientos[i].importeCent !== movimientos[i].saldoCent) {
      errores.push(movimientos[i].orden)
    }
  }
  return errores
}
