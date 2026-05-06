import * as XLSX from 'xlsx'
import {
  REPARTIDOR_LABEL,
  UNIDAD_LABEL,
  type Pedido,
  type Repartidor,
} from '../types'

const REPARTIDOR_ORDER: Repartidor[] = ['TORRES', 'GERMAN', 'RAUL', 'ALEX']
const HEADER = ['CLIENTE', 'HORARIO', 'FACTURA', 'PEDIDO', 'FALTAS', 'REPARTO']

type Fila = (string | number)[]

function ordenSalida(s: string | null | undefined): number {
  if (s === 'PRIMERA' || s == null) return 0
  if (s === 'SEGUNDA') return 1
  return 2
}

function formatN(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function resumenPedido(p: Pedido): string {
  const partes: string[] = []
  if (p.notas_admin) partes.push(`* ${p.notas_admin}`)

  const porSeccion = new Map<string, string[]>()
  for (const l of p.lineas ?? []) {
    const sec = l.subseccion ?? ''
    const txt =
      `${formatN(Number(l.cantidad))} ${UNIDAD_LABEL[l.unidad]} ${l.producto_normalizado}` +
      (l.notas ? ` (${l.notas})` : '') +
      (l.es_gratis ? ' [GRATIS]' : '')
    if (!porSeccion.has(sec)) porSeccion.set(sec, [])
    porSeccion.get(sec)!.push(txt)
  }
  const secciones = [...porSeccion.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [sec, lineas] of secciones) {
    if (sec) partes.push(`${sec}:`)
    partes.push(...lineas)
  }
  return partes.join('\n')
}

function pedidoRow(p: Pedido): Fila {
  const c = p.cliente
  return [
    c?.nombre ?? '—',
    c?.horario ?? '',
    c?.tipo_factura ?? '',
    resumenPedido(p),
    p.faltas ?? '',
    c ? REPARTIDOR_LABEL[c.repartidor] : '',
  ]
}

function ordenarPedidos(pedidos: Pedido[]): Pedido[] {
  return [...pedidos].sort((a, b) => {
    const ra = REPARTIDOR_ORDER.indexOf(a.cliente?.repartidor ?? 'ALEX')
    const rb = REPARTIDOR_ORDER.indexOf(b.cliente?.repartidor ?? 'ALEX')
    if (ra !== rb) return ra - rb
    const sa = ordenSalida(a.cliente?.salida)
    const sb = ordenSalida(b.cliente?.salida)
    if (sa !== sb) return sa - sb
    return (a.cliente?.horario ?? '').localeCompare(b.cliente?.horario ?? '')
  })
}

function buildSheetData(pedidos: Pedido[]): Fila[] {
  const filas: Fila[] = [HEADER]
  let prevRep: Repartidor | null = null
  let prevSalida: string | null | undefined = undefined

  for (const p of pedidos) {
    const rep = p.cliente?.repartidor ?? null
    const salida = p.cliente?.salida ?? null

    if (rep && rep !== prevRep) {
      // separador de bloque por repartidor (cuando se mezclan en COMPLETA)
      if (prevRep !== null) filas.push(['', '', '', '', '', ''])
      filas.push([`── ${REPARTIDOR_LABEL[rep]} ──`, '', '', '', '', ''])
      prevSalida = undefined
    }

    if (
      (rep === 'GERMAN' || rep === 'RAUL') &&
      salida === 'SEGUNDA' &&
      prevSalida !== 'SEGUNDA' &&
      prevSalida !== undefined
    ) {
      filas.push(['', '', '', '── Segunda salida ──', '', ''])
    }

    filas.push(pedidoRow(p))
    prevRep = rep
    prevSalida = salida
  }

  return filas
}

function makeSheet(filas: Fila[]) {
  const ws = XLSX.utils.aoa_to_sheet(filas)
  ws['!cols'] = [
    { wch: 28 },  // CLIENTE
    { wch: 8 },   // HORARIO
    { wch: 10 },  // FACTURA
    { wch: 60 },  // PEDIDO
    { wch: 24 },  // FALTAS
    { wch: 12 },  // REPARTO
  ]
  return ws
}

export function exportarHojaRuta(pedidos: Pedido[], fechaIso: string) {
  const ordenados = ordenarPedidos(pedidos)
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, makeSheet(buildSheetData(ordenados)), 'COMPLETA')

  for (const rep of REPARTIDOR_ORDER) {
    const subset = ordenados.filter(p => p.cliente?.repartidor === rep)
    if (subset.length === 0) continue
    const filas = buildSheetData(subset)
    XLSX.utils.book_append_sheet(wb, makeSheet(filas), REPARTIDOR_LABEL[rep].toUpperCase())
  }

  XLSX.writeFile(wb, `ruta-${fechaIso}.xlsx`)
}

// ===== Export lista de compra =====
export type CompraFila = {
  producto: string
  unidad: string
  pedido_total: number
  inventario: number
  a_comprar: number
  pedido_cajas: number | null
  inventario_cajas: number | null
  a_comprar_cajas: number | null
  kg_por_caja: number | null
}

export function exportarCompra(filas: CompraFila[], fechaIso: string) {
  const HEADER_COMPRA = [
    'PRODUCTO', 'UNIDAD',
    'PEDIDO', 'PEDIDO (cajas)',
    'INVENTARIO', 'INVENTARIO (cajas)',
    'A COMPRAR', 'A COMPRAR (cajas)',
    'kg/caja',
  ]
  const rows: Fila[] = [HEADER_COMPRA]
  for (const f of filas) {
    rows.push([
      f.producto,
      f.unidad,
      f.pedido_total,
      f.pedido_cajas ?? '',
      f.inventario,
      f.inventario_cajas ?? '',
      f.a_comprar,
      f.a_comprar_cajas ?? '',
      f.kg_por_caja ?? '',
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 28 },  // PRODUCTO
    { wch: 8 },   // UNIDAD
    { wch: 10 }, { wch: 12 },
    { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 14 },
    { wch: 8 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'COMPRA')
  XLSX.writeFile(wb, `compra-${fechaIso}.xlsx`)
}
