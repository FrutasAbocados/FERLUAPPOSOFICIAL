import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aggregateProducts,
  formatCantidad,
  formatForExcel,
  formatForList,
  normalizeProduct,
  normalizeUnit,
  parseRawOrder,
  procesarPedido,
} from '../src/modules/pedidos-wa/lib/limpiar-pedido/engine.ts'

/** "Producto\tN unidad" por línea, tal cual se pega en Excel. */
function tsv(texto: string): string {
  return formatForExcel(procesarPedido(texto).lineas)
}

const PEDIDO_REAL = `1 c banana amarilla

1 bolsa zanahoria / 2 c naranja / 1 c piña / 2 c melon / 1 hierbabuena / 1 perejil

10 c aguacate / 10 ajo pelado / 3 canonigos / 1 cebollino / 3 mezclum

1 hierbabuena / 1 c pim rojo / 1 kg pim amarillo / 1 albahaca / 1 perejil / 4 lechuga romana / 2 mezclum / 2 berros / 1 c champi / 1 kg fresa / 1 arandanos

2 c naranja / 4 bolsas pim padron / 1 perejil

1 c naranja / 1 c daniela / 1 c iceberg / 3 pepino holandes / 1 rucula / 1 brote soja

1 kg pera conferencia / 1 saco torcal / 1 perejil

2 c naranja / 1 c daniela / 1 c iceberg

1 kg platano canario / 1 melon / 1 kg uva / 1 kg manzana pink lady

3 sandia / 3 melon / 1 c limon / 4 mezclum / 2 ajo pelado / 1 perejil / 1 c melendez

3 c naranja / 4 mezclum / 1 c champi / 1 apio / 1 bolsa zanahoria

1 c limon / 1 ajo pelado`

const ESPERADO = [
  'Aguacate\t10 cajas',
  'Ajo pelado\t13 unidades',
  'Albahaca\t1 manojo',
  'Apio\t1 unidad',
  'Arándanos\t1 bandeja',
  'Banana amarilla\t1 caja',
  'Berros\t2 bolsas',
  'Brote de soja\t1 paquete',
  'Canónigos\t3 bolsas',
  'Cebollino\t1 manojo',
  'Champiñón\t2 cajas',
  'Fresa\t1 kg',
  'Hierbabuena\t2 manojos',
  'Iceberg\t2 cajas',
  'Lechuga romana\t4 unidades',
  'Limón\t2 cajas',
  'Manzana Pink Lady\t1 kg',
  'Meléndez\t1 caja',
  'Melón\t2 cajas',
  'Melón\t4 unidades',
  'Mezclum\t13 bolsas',
  'Naranja\t10 cajas',
  'Patata Torcal\t1 saco',
  'Pepino holandés\t3 unidades',
  'Pera conferencia\t1 kg',
  'Perejil\t5 manojos',
  'Pimiento amarillo\t1 kg',
  'Pimiento padrón\t4 bolsas',
  'Pimiento rojo\t1 caja',
  'Piña\t1 caja',
  'Plátano canario\t1 kg',
  'Rúcula\t1 bolsa',
  'Sandía\t3 unidades',
  'Tomate Daniela\t2 cajas',
  'Uva\t1 kg',
  'Zanahoria\t2 bolsas',
].join('\n')

describe('limpiar pedido para Excel', () => {
  it('TEST PRINCIPAL: pedido real de 12 líneas → 36 filas exactas', () => {
    assert.equal(tsv(PEDIDO_REAL), ESPERADO)
  })

  it('no pierde ni duplica productos', () => {
    const { lineas } = procesarPedido(PEDIDO_REAL)
    assert.equal(lineas.length, 36)
    assert.equal(lineas.filter(l => l.producto === 'Melón').length, 2)
  })

  describe('separadores', () => {
    it('acepta "/" salto de línea y tabulación', () => {
      assert.equal(tsv('2 c naranja / 1 c piña\n1 apio\t3 mezclum'),
        'Apio\t1 unidad\nMezclum\t3 bolsas\nNaranja\t2 cajas\nPiña\t1 caja')
    })

    it('acepta tabla Markdown y <br>', () => {
      const md = '| Producto | Cantidad |\n|---|---|\n| 2 c naranja | 1 apio |\n1 perejil<br>2 mezclum'
      assert.equal(tsv(md),
        'Apio\t1 unidad\nMezclum\t2 bolsas\nNaranja\t2 cajas\nPerejil\t1 manojo')
    })

    it('no rompe fracciones "1/2 c naranja"', () => {
      assert.equal(tsv('1/2 c naranja'), 'Naranja\t0,5 cajas')
    })
  })

  describe('notas operativas', () => {
    it('aparta las notas sueltas y conserva los productos', () => {
      const r = procesarPedido('COBRAR FACTURA SABADO\n1 perejil / 2 c naranja\nCARGAR CARTONES')
      assert.equal(formatForExcel(r.lineas), 'Naranja\t2 cajas\nPerejil\t1 manojo')
      assert.deepEqual(r.notas, ['COBRAR FACTURA SABADO', 'CARGAR CARTONES'])
    })

    it('rescata el producto cuando la nota va pegada a una sola línea', () => {
      const r = procesarPedido('1 perejil COBRAR DATAFONO')
      assert.equal(formatForExcel(r.lineas), 'Perejil\t1 manojo')
      assert.equal(r.lineas[0].revisar, true)
    })

    it('NO inventa cantidades desde una nota con varios productos', () => {
      const r = procesarPedido('3 SANDIAS Y 3 MELON REGALO\n3 sandia / 3 melon / 1 c limon')
      assert.equal(formatForExcel(r.lineas),
        'Limón\t1 caja\nMelón\t3 unidades\nSandía\t3 unidades')
      assert.deepEqual(r.notas, ['3 SANDIAS Y 3 MELON REGALO'])
    })
  })

  describe('unidades', () => {
    it('la unidad escrita manda sobre el formato habitual', () => {
      assert.equal(tsv('2 c melon'), 'Melón\t2 cajas')
      assert.equal(tsv('2 melon'), 'Melón\t2 unidades')
    })

    it('nunca mezcla unidades distintas del mismo producto', () => {
      assert.equal(tsv('2 c melon / 1 melon / 3 melon'),
        'Melón\t2 cajas\nMelón\t4 unidades')
    })

    it('singular y plural correctos', () => {
      assert.equal(formatCantidad(1, 'caja'), '1 caja')
      assert.equal(formatCantidad(2, 'caja'), '2 cajas')
      assert.equal(formatCantidad(1, 'unidad'), '1 unidad')
      assert.equal(formatCantidad(3, 'unidad'), '3 unidades')
      assert.equal(formatCantidad(1, 'manojo'), '1 manojo')
      assert.equal(formatCantidad(5, 'manojo'), '5 manojos')
      assert.equal(formatCantidad(1, 'kg'), '1 kg')
      assert.equal(formatCantidad(4, 'kg'), '4 kg')
      assert.equal(formatCantidad(2, 'saco'), '2 sacos')
      assert.equal(formatCantidad(2, 'bandeja'), '2 bandejas')
      assert.equal(formatCantidad(2, 'paquete'), '2 paquetes')
    })

    it('no confunde el inicio de un producto con una abreviatura de unidad', () => {
      assert.equal(tsv('1 cebollino / 2 berros / 1 uva / 1 apio'),
        'Apio\t1 unidad\nBerros\t2 bolsas\nCebollino\t1 manojo\nUva\t1 unidad')
    })
  })

  describe('normalización', () => {
    it('unifica alias con y sin acento o abreviados', () => {
      assert.equal(normalizeProduct('pim rojo').producto, 'Pimiento rojo')
      assert.equal(normalizeProduct('PIMIENTO ROJO').producto, 'Pimiento rojo')
      assert.equal(normalizeProduct('pim. rojo').producto, 'Pimiento rojo')
      assert.equal(normalizeProduct('canonigos').producto, 'Canónigos')
      assert.equal(normalizeProduct('CANÓNIGOS').producto, 'Canónigos')
      assert.equal(normalizeProduct('daniela').producto, 'Tomate Daniela')
    })

    it('suma alias distintos del mismo producto', () => {
      assert.equal(tsv('1 c pim rojo / 2 c pimiento rojo / 1 c pim. rojo'),
        'Pimiento rojo\t4 cajas')
    })

    it('normalizeUnit devuelve null para lo que no es unidad', () => {
      assert.equal(normalizeUnit('cajas'), 'caja')
      assert.equal(normalizeUnit('Kg'), 'kg')
      assert.equal(normalizeUnit('melon'), null)
      assert.equal(normalizeUnit(null), null)
    })
  })

  describe('productos desconocidos', () => {
    it('conserva el producto y respeta la unidad escrita', () => {
      const r = procesarPedido('2 c producto extraño')
      assert.equal(formatForExcel(r.lineas), 'Producto extraño\t2 cajas')
      assert.equal(r.lineas[0].revisar, false)
    })

    it('cae en unidades y lo marca para revisión si no hay unidad', () => {
      const r = procesarPedido('2 producto extraño')
      assert.equal(formatForExcel(r.lineas), 'Producto extraño\t2 unidades')
      assert.equal(r.lineas[0].revisar, true)
    })

    it('aparta lo que no tiene cantidad en lugar de inventarla', () => {
      const r = parseRawOrder('perejil suelto sin cantidad')
      assert.equal(r.lineas.length, 0)
      assert.deepEqual(r.noReconocidos, ['perejil suelto sin cantidad'])
    })
  })

  describe('salidas', () => {
    it('formatForExcel con encabezados', () => {
      assert.equal(formatForExcel(procesarPedido('10 c aguacate').lineas, true),
        'Producto\tCantidad\nAguacate\t10 cajas')
    })

    it('formatForList usa una sola columna', () => {
      assert.equal(formatForList(procesarPedido('10 c aguacate / 1 albahaca').lineas),
        'Aguacate - 10 cajas\nAlbahaca - 1 manojo')
    })

    it('aggregateProducts es idempotente', () => {
      const { lineas } = procesarPedido(PEDIDO_REAL)
      assert.deepEqual(aggregateProducts(lineas).map(l => l.producto), lineas.map(l => l.producto))
    })
  })
})
