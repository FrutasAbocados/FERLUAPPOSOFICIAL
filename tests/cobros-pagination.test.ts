import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllCobrosPages } from '../src/modules/cobros/lib/pagination.ts'

const rows = Array.from({ length: 2897 }, (_, i) => ({ id: String(i), importe: 1 }))

test('Cobros carga más de 1000 filas sin perder ni duplicar movimientos', async () => {
  const result = await fetchAllCobrosPages(async (from, to) => ({
    data: rows.slice(from, to + 1), count: rows.length, error: null,
  }))
  assert.deepEqual(result, rows)
  assert.equal(result.reduce((sum, row) => sum + row.importe, 0), 2897)
})

test('continúa aunque el servidor devuelva páginas menores de las solicitadas', async () => {
  const result = await fetchAllCobrosPages(async (from) => ({
    data: rows.slice(from, from + 100), count: rows.length, error: null,
  }))
  assert.deepEqual(result, rows)
})

test('acepta tablas vacías y múltiplos exactos del tamaño de página', async () => {
  for (const size of [0, 500, 1000]) {
    const result = await fetchAllCobrosPages(async (from, to) => ({
      data: rows.slice(0, size).slice(from, to + 1), count: size, error: null,
    }))
    assert.equal(result.length, size)
  }
})

test('un fallo en la segunda página no devuelve totales parciales', async () => {
  await assert.rejects(fetchAllCobrosPages(async (from, to) => from === 0
    ? { data: rows.slice(from, to + 1), count: rows.length, error: null }
    : { data: null, count: null, error: { message: 'sin conexión' } }), /sin conexión/)
})

test('rechaza un corte silencioso después de 1000 filas', async () => {
  await assert.rejects(fetchAllCobrosPages(async (from, to) => ({
    data: from < 1000 ? rows.slice(from, to + 1) : [], count: rows.length, error: null,
  })), /incompleta/)
})

test('rechaza recuentos ausentes o cambiantes y páginas repetidas', async () => {
  await assert.rejects(fetchAllCobrosPages(async () => ({ data: rows.slice(0, 500), count: null, error: null })), /recuento/)
  await assert.rejects(fetchAllCobrosPages(async (from, to) => ({
    data: rows.slice(from, to + 1), count: rows.length + (from ? 1 : 0), error: null,
  })), /han cambiado/)
  await assert.rejects(fetchAllCobrosPages(async () => ({ data: rows.slice(0, 500), count: rows.length, error: null })), /repetidos/)
})
