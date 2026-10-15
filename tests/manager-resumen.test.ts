import test from 'node:test'
import assert from 'node:assert/strict'
import { parseManagerResumen } from '../src/modules/manager/lib/resumen.ts'

test('el resumen normaliza numeric de PostgREST y conserva porcentajes desconocidos', () => {
  const result = parseManagerResumen({
    resumen: {
      ventas: '121.00', ventas_ant: '100', ventas_delta_pct: '21.0',
      compras: '40.5', compras_ant: '0', compras_delta_pct: null,
      margen: '-3.25', margen_ant: '2', margen_delta_pct: '-262.5',
      pendiente_cobro: '20', docs: '2', cogs: '103.25', margen_pct: '-3.3',
      comp_from: '2026-09-01', comp_to: '2026-09-30',
    },
    serie: [{ fecha: '2026-10-01', ventas: '121', compras: null, margen: '-3.25' }],
    top_clientes: [{ contact_name_canon: 'CLIENTE', docs: '2', ventas: '121', ventas_subtotal: '100', cogs: '103.25', margen: '-3.25', margen_pct: null }],
    top_productos: [{ nombre: 'PRODUCTO', product_id: null, unidades: '2.5', margen: '-3.25', margen_pct: null }],
  })
  assert.equal(result.resumen.ventas, 121)
  assert.equal(result.resumen.margen, -3.25)
  assert.equal(result.resumen.margen_delta_pct, -262.5)
  assert.equal(result.resumen.compras_delta_pct, null)
  assert.equal(result.resumen.docs, 2)
  assert.deepEqual(result.serie, [{ fecha: '2026-10-01', ventas: 121, compras: 0, margen: -3.25 }])
  assert.equal(result.topClientes[0].cogs, 103.25)
  assert.equal(result.topClientes[0].margen_pct, null)
  assert.equal(result.topProductos[0].unidades, 2.5)
  assert.equal(result.topProductos[0].product_id, null)
})

test('un periodo sin ventas conserva cero en importes y listas vacías', () => {
  const result = parseManagerResumen({ resumen: {}, serie: [], top_clientes: [], top_productos: [] })
  assert.equal(result.resumen.ventas, 0)
  assert.equal(result.resumen.margen_pct, null)
  assert.deepEqual(result.topClientes, [])
  assert.deepEqual(result.topProductos, [])
})

test('una respuesta denegada o incompleta falla sin presentarla como ventas cero', () => {
  for (const payload of [null, {}, { resumen: {} }, { resumen: {}, serie: [], top_clientes: null, top_productos: [] }]) {
    assert.throws(() => parseManagerResumen(payload), /No se pudo cargar el resumen/)
  }
})
