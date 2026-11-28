import test from 'node:test'
import assert from 'node:assert/strict'
import { centimos, enmascararTarjetas, facturasCitadas, leerExtractoBbva } from '../src/modules/gestoria/lib/banco/bbva.ts'
import { payloadImportacion } from '../src/modules/gestoria/lib/banco/importar.ts'

// Extracto ficticio con la misma maqueta que el PDF «Movimientos» de BBVA
// (más reciente primero; concepto encima de la fila y detalle debajo).
const LINEAS = [
  '1 2  /',
  'Movimientos',
  'Titular  EMPRESA DE PRUEBA S.L.  Fecha  01/12/2026 Hora 10:00',
  'Cuenta  ES0000000000000000000001  Periodo  01/11/2026-30/11/2026',
  'Divisa  EUR  Importe  Todos',
  'Banco  BANCO BILBAO VIZCAYA ARGENTARIA S.A.  Filtros  Todos',
  'F. CONTABLE  F. VALOR  CÓDIGO  CONCEPTO|BENEF./ORDENANTE  IMPORTE  SALDO',
  'PAGO CON TARJETA EN RESTAURANTES Y',
  '27/11/2026  25/11/2026  00929  CAFETERIAS  -26,7 EUR  1.073,30 EUR',
  '5529310010982324 Bar de prueba',
  'TRANSFERENCIAS | CLIENTE UNO SL',
  '26/11/2026  26/11/2026  00007  1.000,00 EUR  1.100,00 EUR',
  'FACTURA F263333 y F263334',
  '2 2  /',
  'CARGO POR AMORTIZACION DE PRESTAMO',
  '25/11/2026  25/11/2026  00379  /CREDITO  -50,00 EUR  100,00 EUR',
  '0182-0000-00-0000000000',
]

test('lee movimientos en orden cronológico, en céntimos y con saldos encadenados', () => {
  const e = leerExtractoBbva(LINEAS)
  assert.equal(e.iban, 'ES0000000000000000000001')
  assert.equal(e.titular, 'EMPRESA DE PRUEBA S.L.')
  assert.equal(e.movimientos.length, 3)
  assert.deepEqual(e.movimientos.map((m) => m.importeCent), [-5000, 100000, -2670])
  assert.equal(e.saldoInicialCent, 15000)
  assert.equal(e.saldoFinalCent, 107330)
  assert.equal(e.desde, '2026-11-25')
  assert.equal(e.hasta, '2026-11-27')
})

test('asigna concepto, detalle, categoría y facturas citadas', () => {
  const [prestamo, cobro, tarjeta] = leerExtractoBbva(LINEAS).movimientos
  assert.equal(prestamo.categoria, 'prestamo_cuota')
  assert.equal(cobro.categoria, 'cobro_transferencia')
  assert.equal(cobro.concepto, 'TRANSFERENCIAS | CLIENTE UNO SL')
  assert.deepEqual(cobro.facturas, ['F263333', 'F263334'])
  assert.equal(tarjeta.categoria, 'tarjeta')
  assert.equal(tarjeta.concepto, 'PAGO CON TARJETA EN RESTAURANTES Y CAFETERIAS')
  assert.equal(tarjeta.detalle, '************2324 Bar de prueba')
  assert.deepEqual(tarjeta.facturas, [])
})

test('rechaza un extracto cuyos saldos no encadenan', () => {
  const roto = LINEAS.map((l) => l.replace('1.100,00 EUR', '1.100,01 EUR'))
  assert.throws(() => leerExtractoBbva(roto), /no encadenan/)
})

test('rechaza documentos que no son de BBVA', () => {
  assert.throws(() => leerExtractoBbva(['Hola', 'Cuenta ES0000000000000000000001']), /BBVA/)
})

test('importes, tarjetas y referencias', () => {
  assert.equal(centimos('2.684,3'), 268430)
  assert.equal(centimos('-0,05'), -5)
  assert.equal(enmascararTarjetas('tarjeta 5529310010982324 x'), 'tarjeta ************2324 x')
  assert.deepEqual(facturasCitadas('Fact f26974 FACTURA F263333 REM 20261100006167191169'), ['F263333'])
})

test('el payload lleva céntimos y el sha del archivo', () => {
  const p = payloadImportacion(leerExtractoBbva(LINEAS), 'x.pdf', 'a'.repeat(64))
  assert.equal(p.p_extracto.saldo_inicial_cent, 15000)
  assert.equal(p.p_movimientos.length, 3)
  assert.equal(p.p_movimientos[1].importe_cent, 100000)
})
