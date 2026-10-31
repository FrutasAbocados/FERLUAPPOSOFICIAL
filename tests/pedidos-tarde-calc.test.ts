import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularPedidosTardeKpis,
  pctRepartidorPorFecha,
  type PedidoTardeFactura,
} from '../src/modules/trabajadores/lib/pedidos-tarde-calc.ts'

const factura = (
  importe_total: number,
  beneficio: number,
  metodo_cobro: 'tarjeta' | 'efectivo',
  fecha: string,
  extra: Partial<PedidoTardeFactura> = {},
): PedidoTardeFactura => {
  const nov = fecha >= '2026-11-01'
  return {
    id: `${fecha}-${importe_total}`, manager_factura_id: 'x', numero_factura: 'x', cliente: 'x', fecha,
    subtotal: 0, importe_total, coste: 0, beneficio, metodo_cobro,
    cobrada_cliente: true, cobrada_at: 'x', liquidada_empresa: false, liquidada_at: null,
    created_by: 'r', created_at: 'x', updated_at: 'x',
    pct_repartidor: nov ? 50 : 80, pct_luis: nov ? 15 : 0, pct_alvaro: nov ? 15 : 0,
    pct_impuesto: nov ? 20 : 0, pct_empresa: nov ? 0 : 20,
    ...extra,
  }
}
const r2 = (n: number) => Math.round(n * 100) / 100

test('el reparto cambia el 1 de noviembre de 2026', () => {
  assert.equal(pctRepartidorPorFecha('2026-10-31'), 80)
  assert.equal(pctRepartidorPorFecha('2026-11-01'), 50)
})

test('octubre real de Raúl: cuatro facturas de El Golf en efectivo sin liquidar', () => {
  const k = calcularPedidosTardeKpis([
    factura(72.29, 24.72, 'efectivo', '2026-10-15'),
    factura(90.90, 33.65, 'efectivo', '2026-10-05'),
    factura(125.58, 45.70, 'efectivo', '2026-10-21'),
    factura(56.52, 21.84, 'efectivo', '2026-10-26'),
  ])
  assert.equal(r2(k.pendienteRepartidorEmpresa), 244.56)
  assert.equal(k.pendienteEmpresaRepartidor, 0)
})

test('noviembre: 15 Luis / 15 Álvaro / 20 impuesto / 50 repartidor, tarjeta y efectivo', () => {
  const k = calcularPedidosTardeKpis([
    factura(100, 40, 'tarjeta', '2026-11-03'),
    factura(100, 40, 'efectivo', '2026-11-04'),
  ])
  assert.equal(r2(k.beneficioRepartidor), 40)
  assert.equal(r2(k.beneficioLuis), 12)
  assert.equal(r2(k.beneficioAlvaro), 12)
  assert.equal(r2(k.impuesto), 16)
  assert.equal(k.beneficioEmpresa, 0)
  assert.equal(r2(k.pendienteEmpresaRepartidor), 20)
  assert.equal(r2(k.pendienteRepartidorEmpresa), 80)
  assert.equal(r2(k.balance), -60)
})

test('lo liquidado o sin cobrar no cuenta como pendiente', () => {
  const k = calcularPedidosTardeKpis([
    factura(100, 40, 'efectivo', '2026-11-03', { liquidada_empresa: true, liquidada_at: 'x' }),
    factura(100, 40, 'tarjeta', '2026-11-03', { cobrada_cliente: false, cobrada_at: null }),
  ])
  assert.equal(k.pendienteRepartidorEmpresa, 0)
  assert.equal(k.pendienteEmpresaRepartidor, 0)
  assert.equal(r2(k.beneficioRepartidor), 40)
})
